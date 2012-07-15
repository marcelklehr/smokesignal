var net      = require('net')
  ,	events   = require('events')
  ,	util     = require('util')
  ,	packager = require('./packager')
  ,	log4js   = require('log4js')
  ,	Peerlist = require('./peerlist')

var logger = log4js.getLogger('p2p')

var inspect = function(label, obj) {
  return label+'\n'+JSON.stringify(obj, null, '\t')
}


/**
Class: Node

Events:
 - 'listen' Fired, when the node starts listening
 - 'connect' Fired, when adding the first peer (regardless of whether the node is supernode)
 - 'broadcast' Fired, when a broadcast message is received
 - 'error' Fired, when the server or a socket throw an error
 - 'disconnect' Fired, when the last peer closes the connection (regardless of whether the node is supernode)
*/
function Node(opts) {
  this.setOpts(opts)
  this.pkg = new packager(this)
  
  this.peers = new Peerlist(this) // Manages all peers of this node
  
  // Each hash contains data like: 'pkg-id' -> {pkg.content}
  this.sent = { connects: {}
              , pings: {} }
  
  // The IDs of all packages this node has seen
  this.knownPackages = {}
  
  // Stores the timer and the callback for each ping: 'pkg-id' -> { timer: TimeoutHandle, callback: Function }
  this.pings = {}
  
  this.logger = logger
  logger.setLevel(this.opts.logLevel)
}

module.exports = Node
module.exports.inspect = inspect

util.inherits(Node, events.EventEmitter)

/**
Default settings
*/
Node.opts =
{ maxPeers: 5
, localIp: ''
, localPort: 0
, isSuper: false
, supernode:
  { ip: ''
  , port: 0
  }
, logLevel: 'OFF'
, updateInterval: 10000
}

/**
Sets the passed options by extending the defaults.
*/
Node.prototype.setOpts = function setOpts(opts) {
  this.opts = Node.opts
  for(var prop in Node.opts) {
    if(!opts[prop]) continue
    if(typeof(opts[prop]) !== typeof(Node.opts[prop])) throw Error('Option '+prop+' must be of type '+typeof(Node.opts[prop]))
    this.opts[prop] = opts[prop]
  }
}

/**
Creates a node and binds it to a server
*/
Node.createNode = function createNode(opts) {
  var node = new Node(opts)
  node.server = net.createServer(function (socket) {
    logger.debug('Incoming Connection from '+socket.remoteAddress+':'+socket.remotePort)
    socket.setEncoding('utf8')
    socket.on('data', function(data) {
      node.ondata(socket, data)
    })
    socket.on('error', function(er) {
      node.logger.fatal(er.message)
      node.emit('error', er)
    })
  })
  node.server.on('error', function(er) {
    node.logger.fatal(er.message)
    node.emit('error', er)
  })
  return node
}

/**
Opens a socket to the specified target and binds it to this node
*/
Node.prototype.openSocket = function(ip, port, func) {
  var node = this
  var socket = net.createConnection(port, ip, function() {
    socket.on('data', function(data) {
      node.ondata(socket, data)
    })
    socket.on('error', function(er) {
      node.logger.fatal(er.message)
      node.emit('error', er)
    })
    process.nextTick(function() {
      func()
    })
  })
  return socket
}

/**
Sends a CONNECT to the supernode
*/
Node.prototype.enterNetwork = function() {
  var node = this, socket
  var super_n = node.opts.supernode
  
  logger.info('Trying to enter Network')
  
  socket = node.openSocket(super_n.ip, super_n.port, function() {
    logger.info("Connecting supernode at "+super_n.ip+":"+super_n.port)
    
    connect = node.pkg.build( 'connect',
                            { remoteAddress: node.opts.localIp
                            , remotePort: node.opts.localPort }
    )
    socket.write(connect.str)
    node.sent.connects[connect.json.id] = connect.json.content
  })
  
  socket.on('error', function(er) {
    logger.error('Coudn\'t connect to supernode: '+er.message);
  });
}

Node.prototype.ping = function(targetIp, cb) {
  var node = this, content
  if(!node.pings[targetIp]) node.pings[targetIp] = {}
  clearTimeout(node.pings[targetIp].timer)
  
  var id = this.peers.send('ping', content = {targetIp: targetIp})
  this.sent.pings[id] = content
  
  
  node.pings[targetIp] = { timer: setTimeout(function() {
                                    callback(new Error('Ping target did not respond within timeout'))
                                  }, 10000)
                          , callback: cb }
}

/**
Sends a CONNECT to all peers or tries to reenter the network, if there are no peers
*/
Node.prototype.sendConnect = function() {
  if(this.opts.isSuper) return;
  
  if(this.peers.list.length == 0) {
    return this.enterNetwork()
  }
  
  logger.debug('Trying to find some more peers');
  
  var content  = { remoteAddress: this.opts.localIp
                 , remotePort: this.opts.localPort }
  
  var id = this.peers.send('connect', content)
  this.sent.connects[id] = content
}

/**
Broadcasts a $message to all peers
*/
Node.prototype.sendBroadcast = function(message) {
  this.peers.send('broadcast', message)
}

/**
The reactor. It decides what to do with incoming packages
*/
Node.prototype.ondata = function(socket, data) {
  var node = this
  logger.debug("A package arrived from "+socket.remoteAddress)
  
  // PARSE DATA //
  try {
    pkg = JSON.parse(data)
  } catch(e) {
    logger.info('Parse error: '+e.messae+'\n'+data)
    socket.end()
    return
  }
  
  node.logger.trace(inspect('Package data', pkg))
  
  var cb = function() {
    node.knownPackages[pkg.id] = true
    if(!node.peers.inList(socket)) {
      logger.trace(inspect('Peerlist', node.peers.dump()))
      logger.trace('Closing connection to non-peer '+socket.remoteAddress)
      socket.end()
    }
  }
  
  // KNOWN PACKAGES //
  if(node.knownPackages[pkg.id]) {
    node.logger.trace(inspect('Known packages', node.knownPackages))
    logger.debug('Already got this package!')
  }else

  // CONNECT //
  if (node.pkg.isConnect(pkg, socket)) {
    logger.debug('type CONNECT')
    
    // Cannot make friends with remote end
    if(node.peers.isFull() || node.peers.inList(pkg.content)) {
      node.peers.forward(data)
      logger.debug('Peerlist full or already friends with origin: Forwarding...')
      cb()
    }else
    
    // Remote end accepts CONNECT
    if(pkg.content.respondsTo){
      logger.debug(socket.remoteAddress+' confirms CONNECT')
      node.peers.add(socket)
      cb()
    }else
    
    // Confirm CONNECT request
    {
      var sock = node.openSocket(pkg.content.remoteAddress, pkg.content.remotePort, function() {
        var peer = node.peers.add(sock)
        peer.send(node.pkg.build('connect', {respondsTo: pkg.id}).str)
        cb()
      })
    }
  }else

  // BROADCAST //
  if(this.pkg.isBroadcast(pkg, socket)) {
    logger.debug('type BROADCAST')
    node.emit('broadcast', pkg.content)
    node.peers.forward(data, socket)
    cb()
  }else
  
  // PING //
  if(this.pkg.isPing(pkg, socket)) {
    logger.debug('type Ping')
    
    var targetPeer
    node.peers.list.forEach(function(peer) {
      if(peer.remoteIp == pkg.content.targetIp) {
        targetPeer = peer
      }
    })
    
    if(targetPeer) {
      targetPeer.send(data)
      cb()
    }else if(pkg.content.targetIp == node.opt.localIp) {
      var sock = node.openSocket(pkg.content.origin.remoteAddress, pkg.content.origin.remotePort, function() {
        sock.write(node.pkg.build('pong', {respondsTo: pkg.id}).str)
        cb()
      })
    }else{
      node.peers.forward(data)
      cb()
    }
  }else
  
  // PONG //
  if(this.pkg.isPong(pkg, socket)) {
    logger.debug('type Pong')
    
    if (socket.remoteAddress == node.opts.supernode.ip  &&  node.sent.pings[pkg.content.respondsTo]) {
      clearTimeout(node.pings[remoteAddr].timer)
      process.nextTick(function() {
        node.pings[remoteAddr].callback()
      })
      cb()
    }else{
      socket.write('fuck you')
      cb()
    }
  }else
  
  // INVALID PACKAGE //
  {
    logger.debug(inspect("Invalid package", pkg))
    logger.debug("Closing connection")
    socket.end('fuck you')
    return cb()
  }
}

/**
Activates the node and tries to enter the network at $ip:$port
*/
Node.prototype.connect = function(ip, port, func) {
  var node = this
  node.on('listen', func)
  
  node.opts.supernode = { ip: ip
                        , port: port
                        }
  
  node.server.listen(node.opts.localPort, function() {
    node.emit('listen')
  })
  
  setInterval(function() {
    node.logger.debug(inspect('Peerlist ('+node.peers.list.length+'/'+node.opts.maxPeers+')', node.peers.dump()))
    if(!node.peers.isFull()) node.sendConnect()
  }, node.opts.updateInterval)
  node.enterNetwork()
}

/**
Sets up this node as a supernode of a herby newly created network
*/
Node.prototype.spawnNetwork = function(func) {
  var node = this
  node.on('listen', func)
  
  node.opts.isSuper = true
  
  node.server.listen(node.opts.localPort, function() {
    logger.info("Supernode is listening")
    node.emit('listen')
  })
}