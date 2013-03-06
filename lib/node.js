var nssocket = require('nssocket')
  , net = require('net')
  , log4js = require('log4js')
  , Netmask = require('netmask').Netmask
  , os = require('os')
  , EventEmitter = require('events').EventEmitter
  , Peerlist = require('./peerlist')
  , Peer = require('./peer')
  , Broadcast = require('./broadcast')

function Node(options) {
  // Set up configuration
  options = options || {}
  this.options = {
    localNetmask: options.localNetmask // The subnet to use for identifying your current ip address
  , minPeerNo: options.minPeerNo || 5 // (optional) how many peers this node will actively try to bond with -- you can always connect to more manually!
  , maxPeerNo: options.maxPeerNo || 5 // (optional) how many peers this node will accept at max. Infinity for no limit
  , port: options.port // Port to bind at -- maybe make this optional, so it just uses a free port
  , entrance: options.entrance || false // (optional)  a known node, that's part of the network, e.g. {port: 0, address: '127.0.0.1'}
  }
  for(var prop in this.options) if ('undefined' == typeof this.options[prop]) throw new Error('"'+prop+'" option is not set')

  // Set up properties
  this.id = Math.abs(Math.random() * Math.random() * Date.now() | 0).toString(36)
          + Math.abs(Math.random() * Math.random() * Date.now() | 0).toString(36)
  this.listening = false
  this.connected = false
  this.peers = new Peerlist(this)
  this.broadcast = new Broadcast(this)
  this.logger = log4js.getLogger('smoke')
  
  // Determine my IP
  var interfaces = os.networkInterfaces()
    , block = new Netmask(this.options.localNetmask) // https://npmjs.org/package/netmask
  for(var name in interfaces) {
    if(this.remoteAddress) break
    for(var i in interfaces[name]) {
      if(interfaces[name][i].family == 'IPv6') continue
      if(!block.contains(interfaces[name][i].address)) continue
      this.remoteAddress = interfaces[name][i].address
      break
    }
  }
  if(!this.remoteAddress) throw new Error('Couldn\t determine my own IP address')

  // Peer list
  this.peers.on('add', function(peer) {
    if(this.peers.list.length == 1) {
      this.emit('connect')
      this.connected = true
    }
    this.emit('new peer', peer)
  }.bind(this))

  this.peers.on('remove', function() {
    if(this.peers.list.length == 0) {
      this.emit('disconnect')
      this.connected = false
    }
  }.bind(this))
}

module.exports = Node

Node.prototype = new EventEmitter()
Node.prototype.constructor = Node

/**
 * Starts the internal TCP server and connects to the node specified in options.entrance
 */
Node.prototype.start = function() {
  if(this.listening) return
  
  // Set up the server
  this.server = nssocket.createServer(function (socket) {
    this.logger.debug('Incoming Connection from '+socket.socket.remoteAddress+':'+socket.socket.remotePort)
    
    socket.data(['smoke', 'handshake'], this.onHandshake.bind(this, socket))
    socket.data(['smoke', 'peer request'], this.onUnconnectedPeerRequest.bind(this, socket))
    socket.data(['smoke', 'pong'], this.onPong.bind(this, socket))
    
    socket.on('error', function(er) {
      this.logger.error(er)
      this.destroy()
    }.bind(this))
    
    socket._smokeTimeout = setTimeout(function() {
      socket.destroy()
    }, 5000)
  }.bind(this))
  
  this.server.on('error', function(er) {
    this.logger.fatal(er.message)
    this.emit('error', er)
  }.bind(this))

  this.server.on('listening', function() {
    this.listening = true
    this.logger.debug('Server is listening!')
  }.bind(this))
  
  this.server.on('close', function() {
    this.listening = false
  }.bind(this))
  
  this.logger.debug('Starting server at port', this.options.port)
  this.server.listen(this.options.port, function() {
    this.requestPeers()
  }.bind(this))
  
  // Netplit detection
  this.interval = setInterval(function() {
    if(!this.connected) {
      this.enterNetwork()
      return
    }
    
    if(this.options.entrance) {
      this.broadcast.send(['smoke', 'ping'], {
        remoteAddress: this.remoteAddress
      , remotePort: this.options.port
      , targetPort: this.options.entrance.port
      , targetAddress: this.options.entrance.address
      })
    }
    
    this.requestPeers()
  }.bind(this), 10000)
}

/**
 * Disconnects a node
 */
Node.prototype.stop = function() {
  this.server.close()
  this.peers.close()
  clearInterval(this.interval)
}

/**
 * Manually sends a peer request to the node at address:port
 * @param address
 * @param port
 */
Node.prototype.addPeer = function(address, port) {
  this.logger.trace('Trying to add peer at "'+address+':'+port+'"')
  var socket = new nssocket.NsSocket();
  socket.data(['smoke', 'handshake ack'], this.onHandshakeAck.bind(this, socket))
  socket.on('error', function(e) {
    this.logger.error('An error occured while establishing connection to new peer at "'+address+':'+port+'"', e)
  }.bind(this))
  socket.connect(port, address, function() {
    this.logger.trace('sending handshake to "'+address+':'+port+'"')
    socket.send(['smoke', 'handshake'], {id: this.id})
  }.bind(this))
}

Node.prototype.enterNetwork = function() {
  if(!this.options.entrance) return this.logger.warn('Would have tried to enter network, but no entrance specified')
  if(this.options.entrance.port == this.options.port && this.options.entrance.address == this.remoteAddress) return
  this.logger.info('Trying to enter network')
  var socket = new nssocket.NsSocket();
  socket.on('error', function(e) {
    this.logger.error('An error occured while establishing connection to new peer at "'+this.options.entrance.address+':'+this.options.port+'"', e)
  }.bind(this))
  socket.connect(this.options.entrance.port, this.options.entrance.address, function() {
    socket.send(['smoke', 'peer request'], {
      id: this.id
      , remoteAddress: this.remoteAddress
      , remotePort: this.options.port
      })
  }.bind(this))
}

Node.prototype.sendPong = function(oriPacketId, address, port) {
  this.logger.debug('Sending pong')
  var socket = new nssocket.NsSocket();
  socket.on('error', function(e) {
    this.logger.error('An error occured while establishing connection for pinging "'+address+':'+port+'"', e)
  }.bind(this))
  socket.connect(port, address, function() {
    socket.send(['smoke', 'pong'], {
      id: this.id
      , remoteAddress: this.remoteAddress
      , remotePort: this.options.port
      , respondsTo: oriPacketId
      })
  }.bind(this))
}

/**
 * Request some peers
 */
Node.prototype.requestPeers = function() {
  if(this.peers.list.length == 0) {
    this.enterNetwork()
    return
  }
  this.logger.debug('requesting peers')
  this.broadcast.send(['smoke', 'peer request'], {
    id: this.id
    , remoteAddress: this.remoteAddress
    , remotePort: this.options.port
    })
}

/**
 * Called when a handshake is received
 * 
 * @param socket An nssocket
 * @param data {id: 'string'} The peer id of that node
 * @returns
 */
Node.prototype.onHandshake = function(socket, data) {
  this.logger.trace('Incoming handshake. Raw data: ', data)
  if(!data.id) return socket.destroy()
  var peerId = data.id
  this.logger.debug('Receiving handshake from', data.id)
  
  if (this.peers.isFull()) return socket.destory()
  if (this.peers.inList(peerId)) return socket.destroy()
  
  socket.send(['smoke', 'handshake ack'], {id: this.id})
  this.logger.debug('Acknowledgeing handshake')
  
  var peer = new Peer(this, peerId, socket)
  this.peers.add(peer)
}

/**
 * Called when a handshake is received
 * 
 * @param socket An nssocket
 * @param data {id: 'string'} The peer id of that node
 * @returns
 */
Node.prototype.onHandshakeAck = function(socket, data) {
  this.logger.trace('Incoming handshake ack. Raw data: ', data)
  if(!data.id) return socket.destroy()
  var peerId = data.id
  this.logger.debug('Receiving handshake ack from', data.id)

  if (this.peers.isFull()) return socket.destory()
  if (this.peers.inList(peerId)) return socket.destory()
  
  var peer = new Peer(this, peerId, socket)
  this.peers.add(peer)
}

/**
 * Called when a peer request is received by a non-peer
 * 
 * @param socket An nssocket
 * @param data {id: 'string'} The peer id of that node
 * @param data {remoteAddress: 'string'} The ip of that node
 * @param data {remotePort: 0} The port number of that node's server
 * @returns
 */
Node.prototype.onUnconnectedPeerRequest = function(socket, data) {
  this.logger.trace('Incoming unconnected peer request: ', data)
  if(!data.id) return
  if(!net.isIP(data.remoteAddress)) return
  if(typeof(data.remotePort) != 'number') return
  this.logger.debug('Receiving a peer request from unconnected client:', data.id)

  this.broadcast.send(['smoke', 'peer request'], data)
  this.onPeerRequest(data)
}

/**
 * Called when a peer request is received by a peer
 * 
 * @param socket An nssocket
 * @param data {id: 'string'} The peer id of that node
 * @param data {remoteAddress: 'string'} The ip of that node
 * @param data {remotePort: 0} The port number of that node's server
 * @returns
 */
Node.prototype.onPeerRequest = function(data) {
  this.logger.trace('Incoming peer request: ', data)
  
  if(!data.id) return
  if(!net.isIP(data.remoteAddress)) return
  if(typeof(data.remotePort) != 'number') return

  this.logger.debug('Receiving peer request from:', data.id)
  if (this.peers.isFull()) return
  if (this.peers.inList(data.id)) return

  this.logger.debug('Trying to add peer', data.id)
  this.addPeer(data.remoteAddress, data.remotePort)
}

/**
 * Called when a ping is received by a peer
 * 
 * @param packet The raw packet, as received on the socket
 * @param peer The peer send this packet to me
 * @returns
 */
Node.prototype.onPing = function(packet, peer) {
  var data = packet.data
  this.logger.trace('Incoming ping: ', packet.data)
  
  if(!net.isIP(data.targetAddress)) return
  if(!net.isIP(data.remoteAddress)) return
  if(typeof(data.targetPort) != 'number') return
  if(typeof(data.remotePort) != 'number') return

  this.logger.debug('Receiving ping for: "'+data.targetAddress+':'+data.targetPort+'"')
  
  if (this.remoteAddress == data.targetAddress && this.options.port == data.targetPort) {
    this.logger.debug('This ping is meant for me! Responding immediately')
    this.sendPong(packet.id, data.remoteAddress, data.remotePort)
    return
  }

  this.logger.debug('Forwarding the ping')
  this.broadcast.sendPacket(['smoke', 'ping'], packet, peer)
}

/**
 * Called when a ping is received by a peer
 * 
 * @param packet The raw packet, as received on the socket
 * @param peer The peer send this packet to me
 * @returns
 */
Node.prototype.onPong = function(socket, data) {
  var data = packet.data
  this.logger.trace('Incoming pong: ', data)
  
  if(!net.isIP(data.remoteAddress)) return
  if(typeof(data.remotePort) != 'number') return
  if(!this.outstandingPongs[data.respondsTo]) return

  this.logger.debug('Receiving pong from: "'+data.remoteAddress+':'+data.remotePort+'"')
  clearTimeout(this.outstandingPongs[data.respondsTo])
  delete this.outstandingPongs[data.respondsTo]
}