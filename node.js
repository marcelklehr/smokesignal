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
  this.openConnects = [] // Contains the IDs of all sent CONNECT packages
  this.knownPackages = [] // Contains the IDs of all received packages
  
  this.logger = logger
  logger.setLevel(this.opts.logLevel)
}

module.exports = Node

util.inherits(Node, events.EventEmitter)

/**
Default settings
*/
Node.opts =
{ maxPeers: 5
, localAddress: ''
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
                            { remoteAddress: node.opts.localAddress
                            , remotePort: node.opts.localPort }
    )
    socket.write(connect.str)
    node.openConnects.push(connect.json.id)
  })
  
  socket.on('error', function(er) {
    logger.error('Coudn\'t connect to supernode: '+er.message);
  });
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
  
  var id = this.peers.send( 'connect',
                          { remoteAddress: this.opts.localAddress
                          , remotePort: this.opts.localPort }
  )
  this.openConnects.push(id)
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
  
  node.logger.trace(inspect('Known packages', node.knownPackages))
  
  // KNOWN PACKAGES //
  if(node.knownPackages.some(function(id){ return (pkg.id == id) })) {
    logger.debug('Already got this package!')
    return
  }
  
  // RESPONSE //
  if(node.pkg.isResponse(pkg, socket)) {
    logger.debug('type RESPONSE')
    node.peers.add(socket)
  }else

  // CONNECT //
  if(node.pkg.isConnect(pkg, socket)) {
    logger.debug('type CONNECT')
    if(node.peers.isFull() || node.peers.inList(pkg.content))
    {
      node.peers.forward(data)
      logger.debug('Peerlist full or already friends with origin: Forwarding...')
    }else{
      var sock = node.openSocket(pkg.content.remoteAddress, pkg.content.remotePort, function() {
        var peer = node.peers.add(sock)
        peer.send(node.pkg.build('response', {respondsTo: pkg.id}).str)
      })
    }
  }else

  // BROADCAST //
  if(this.pkg.isBroadcast(pkg, socket)) {
    logger.debug('type BROADCAST')
    node.emit('broadcast', pkg.content)
    node.peers.forward(data, socket)
  }else
  
  // INVALID PACKAGE //
  {
    logger.debug(inspect("Invalid package", pkg))
    logger.debug("Closing connection")
    socket.end()
    return
  }
  
  node.knownPackages.push(pkg.id)
  if(!node.peers.inList(socket)) socket.end()
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
  
  setInterval(function() {
    node.logger.debug(inspect('Peerlist ('+node.peers.list.length+'/'+node.opts.maxPeers+')', node.peers.dump()))
  }, node.opts.updateInterval)
}