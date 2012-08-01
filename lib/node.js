var net      = require('net')
  , events   = require('events')
  , util     = require('util')
  , async    = require('async')
  , log4js   = require('log4js')
  , Peerlist = require('./peerlist')
  , Packager = require('./packager')

var logger = log4js.getLogger('p2p')

logger.inspect = function(label, obj) {
  return label+'\n'+JSON.stringify(obj, null, '\t')
}

/**
Class: Node

Events:
 - 'listening' Fired, when the node starts listening #node.js
 - 'connected' Fired, when adding the first peer (regardless of whether the node is supernode) #peerlist.js
 - 'broadcast' Fired, when a broadcast message is received #node.js
 - 'error' Fired, when the server or a socket throw an error #node.js
 - 'disconnected' Fired, when the last peer closes the connection (regardless of whether the node is supernode) #peerlist.js
*/
function Node(opts) {
  var node = this
  
  this.setOpts(opts)
  
  this.pkg = new Packager(this)
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
  
  this.server = net.createServer(function (socket) {
    logger.debug('Incoming Connection from '+socket.remoteAddress+':'+socket.remotePort)
    socket.setNoDelay(true)
    socket.setEncoding('utf8')
    socket.on('data', function(data) {
      node.ondata(socket, data)
    })
    socket.on('error', function(er) {
      node.logger.fatal(er.message)
      node.emit('error', er)
    })
  })
  this.server.on('error', function(er) {
    node.logger.fatal(er.message)
    node.emit('error', er)
  })
  
  this.listening = false
  this.on('listening', function() {
    node.listening = true
  })
}

module.exports = Node

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
Opens a socket to the specified target and binds it to this node
*/
Node.prototype.openSocket = function(ip, port, func) {
  var node = this
  var socket = net.createConnection(port, ip, function() {
    socket.setNoDelay(true)
    socket.setEncoding('utf8')
    socket.on('data', function(data) {
      node.ondata(socket, data)
    })
    socket.on('error', function(er) {
      node.logger.fatal(er.message)
      node.emit('error', er)
    })
    func()
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
    node.sent.connects[connect.json.id] = true//connect.json.content
  })
  
  socket.on('error', function(er) {
    logger.error('Coudn\'t connect to supernode: '+er.message);
  });
}

Node.prototype.ping = function(targetIp, cb) {
  var node = this, content
  if(!node.pings[targetIp]) node.pings[targetIp] = {}
  clearTimeout(node.pings[targetIp].timer)
  
  logger.info('Sending PING to '+targetIp)
  var id = this.peers.send('ping', content = { targetIp: targetIp
                                             , origin: { remoteAddress: node.opts.localIp
                                                       , remotePort: node.opts.localPort } })
  this.sent.pings[id] = true//content
  
  
  node.pings[targetIp] = { timer: setTimeout(function() {
                                    cb(new Error('Ping target did not respond within timeout'))
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
  this.sent.connects[id] = true //content
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
  logger.debug('')
  logger.debug('New package from '+socket.remoteAddress)
  var remoteAddress = socket.remoteAddress
  
  // PARSE DATA //
  try {
    var pkg = JSON.parse(data)
  } catch(e) {
    logger.info('Parse error: '+e.message+'\n'+data)
    socket.end()
    return
  }
  
  node.logger.trace(node.logger.inspect('Package data', pkg))
  
  var cb = function() {
    node.knownPackages[pkg.id] = true
    node.peers.inList(socket, function(inList) {
      if(!inList) {
        node.logger.trace(node.logger.inspect('Peerlist', node.peers.dump()))
        node.logger.trace('Closing connection to non-peer '+remoteAddress)
        socket.end()
      }
    })
  }
  
  // KNOWN PACKAGES //
  if(node.knownPackages[pkg.id]) {
    node.logger.trace(node.logger.inspect('Known packages', node.knownPackages))
    logger.debug('That\'s a known package! Drop it.')
  }else

  // CONNECT //
  if (node.pkg.isConnect(pkg, socket)) {
    logger.debug('type CONNECT')
    
    node.peers.inList(pkg.content, function(inList) {
    
      // Cannot make friends with remote end
      if(node.peers.isFull() || inList) {
        node.peers.forward(data, /*except:*/socket)
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

    })
  }else

  // BROADCAST //
  if(this.pkg.isBroadcast(pkg, socket)) {
    logger.debug('type BROADCAST')
    node.emit('broadcast', pkg.content)
    node.peers.forward(data, /*except:*/socket)
    cb()
  }else
  
  // PING //
  if(this.pkg.isPing(pkg, socket)) {
    logger.debug('type Ping')
    
    if(pkg.content.targetIp == node.opts.localIp) {
      logger.debug('I\'m the ping target!')
      var sock = node.openSocket(pkg.content.origin.remoteAddress, pkg.content.origin.remotePort, function() {
        logger.debug('Responding with PONG to '+pkg.content.origin.remoteAddress+':'+pkg.content.origin.remotePort)
        sock.write(node.pkg.build('pong', {respondsTo: pkg.id}).str)
        cb()
      })
    }else {
      var targetPeer
      node.peers.inList({remoteAddress: pkg.content.targetIp}, function(targetPeer) {
        if(targetPeer) {
          logger.debug('The ping target is one of my peers. Forwarding...')
          targetPeer.send(data)
          cb()
        }else{
          logger.debug('I don\'t know the ping target. Forwarding to all peers.')
          node.peers.forward(data, /*except:*/socket)
          cb()
        }
      })
    }
  }else
  
  // PONG //
  if(this.pkg.isPong(pkg, socket)) {
    logger.debug('type Pong')
    
    if (socket.remoteAddress == node.opts.supernode.ip  &&  node.sent.pings[pkg.content.respondsTo]) {
      clearTimeout(node.pings[socket.remoteAddress].timer)
      process.nextTick(function() {
        node.pings[socket.remoteAddress].callback()
      })
      cb()
    }else{
      logger.debug('fuck you')
      socket.write('fuck you')
      cb()
    }
  }else
  
  // INVALID PACKAGE //
  {
    logger.debug(logger.inspect("Invalid package", pkg))
    logger.debug("Closing connection")
    logger.debug('fuck youg')
    socket.end('fuck you')
    return cb()
  }
}

/**
Activates the node and tries to enter the network at $ip:$port
*/
Node.prototype.connect = function(ip, port, func) {
  var node = this
  this.on('connected', func)
  
  this.opts.supernode = { ip: ip
                        , port: port
                        }
  
  if(!this.listening) {
    this.server.listen(node.opts.localPort, function() {
      node.emit('listening')
    })
  }else{
    this.emit('listening')
  }
  
  setInterval(function() {
    if(!node.peers.isFull()) node.sendConnect()
  }
  , this.opts.updateInterval)
  this.enterNetwork()
}

/**
Sets up this node as a supernode of a herby newly created network
*/
Node.prototype.spawnNetwork = function(func) {
  var node = this
  this.on('listening', func)
  
  this.opts.isSuper = true
  
  if(this.listening) {
    this.emit('listening')
    return
  }
  
  this.server.listen(node.opts.localPort, function() {
    logger.info("Supernode is listening")
    node.emit('listening')
  })
}