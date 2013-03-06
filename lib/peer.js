var EventEmitter = require('events').EventEmitter

/**
 * Class: Peer
 */
var Peer = function(node, id, socket) {
  this.socket = socket
  this.node = node
  this.id = id
  this.closed = false
  
  this.remoteAddress = socket.remoteAddress
  this.remotePort = socket.remotePort
  
  this.socket.on('close', function() {
    this.node.logger.info("Closing connection to peer "+this.id);
    this.close();
  }.bind(this))
  
  this.socket.removeAllListeners('error')
  clearTimeout(socket._smokeTimeout)
  delete socket._smokeTimeout

  this.socket.on('error', function(e) {
    this.node.logger.error('Error in socket '+this.id, e)
    this.close()
  }.bind(this))
  
  this.socket.data(['smoke', 'event'], function(data) {
    var event = data.shift()
    this.$emit(event, data)
  }.bind(this))
}
module.exports = Peer

Peer.prototype = new EventEmitter
Peer.prototype.constructor = Peer

Peer.prototype.$emit = Peer.prototype.emit

Peer.prototype.emit = function(event, data) {
  var data = Array.prototype.slice.apply(arguments)
  this.socket.send(['smoke', 'event'], data)
}

/**
 *Closes the underlying socket and removes peers from peerlist
 */
Peer.prototype.close = function() {
  if(this.closed) return
  this.closed = true
  this.socket.end();
  this.node.peers.remove(this);
}