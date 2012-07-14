var Peer = require('./peer.js')

function Peerlist(node) {
  this.node = node
  this.list = []
}
module.exports = Peerlist

/**
Adds a new peer object for $socket to the list
*/
Peerlist.prototype.add = function(socket) {
  var node = this.node
    , peer = new Peer(this.node, socket)
  
  if(this.list.length == 0) node.emit('connect')
  this.list.push(peer)
  this.node.logger.info('Added new peer: '+socket.remoteAddress+':'+socket.remotePort)
  return peer
}

/**
Removes a peer object from the list
*/
Peerlist.prototype.remove = function(peer) {
  this.list.splice(this.list.indexOf(peer), 1);
  this.node.logger.info('Removed peer: '+peer.remoteIp+':'+peer.remotePort);
  if(this.list.length == 0) this.node.emit('disconnect')
}

/**
Closes all connections to peers
*/
Peerlist.prototype.close = function() {
  var peers = this;
  this.list.forEach(function(peer) {
    peers.list.remove(peer)
    peer.close();
  })
}

/**
Returns the IPs of all peers
*/
Peerlist.prototype.dump = function() {
  return this.list.map(function(peer) {
    return peer.socket.remoteAddress
  })
}

/**
Returns a boolean indicating, whether the peer list is full
*/
Peerlist.prototype.isFull = function() {
  return !(this.list.length < this.node.opts.maxPeers)
}

/**
Checks if a socket is already on the list of peers

Tip: This works with every Object providing a "remoteAddress" property!
*/
Peerlist.prototype.inList= function(socket) {
  return this.list.some(function(peer) {
    return (peer.socket.remoteAddress == socket.remoteAddress)
  })
}


/**
Sends $data to all peers excpet to $except (a socket)
*/
Peerlist.prototype.forward = function(data, except) {
  for(var i=0; i < this.list.length; i++) {
    if(this.list[i].socket === except) continue;
    this.list[i].send(data);
  }
}

/**
Sends a package of $type with $content to all peers
*/
Peerlist.prototype.send = function(type, content) {
  data = this.node.pkg.build(type, content)
  this.forward(data.str)
  this.node.knownPackages[data.json.id] = true
  return data.json.id
}