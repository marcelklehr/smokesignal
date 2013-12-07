var DuplexStream = require('stream').Duplex

/**
 * Class: Peer
 */
var Peer = function(node, id, socket) {
  DuplexStream.apply(this)
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
  
  this.socket.data(['smoke', 'direct'], function(data) {
    this.push(new Buffer(data, 'base64'))
  }.bind(this))
}
module.exports = Peer

Peer.prototype = Object.create(DuplexStream.prototype, { constructor: { value: Peer }})

/**
 *Closes the underlying socket and removes peers from peerlist
 */
Peer.prototype.close = function() {
  if(this.closed) return
  this.closed = true
  this.socket.end();
  this.node.peers.remove(this);
  this.emit('close')
  this.emit('end')
}

Peer.prototype._read = function() {
  // noop
}

Peer.prototype._write = function(chunk, encoding, cb) {
  this.socket.emit(['smoke', 'direct'], chunk.toString('base64'))
  cb()
}