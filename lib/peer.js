/**
Class: Peer
*/
var Peer = function(node, socket) {
  var peer = this
  
  this.socket = socket
  this.node = node
  
  this.remoteIp = socket.remoteAddress
  this.remotePort = socket.remotePort
  
  socket.on('close', function() {
    peer.node.logger.info("Closing connection to peer "+peer.remoteIp);
    peer.close();
	  peer.node.sendConnect();
  })
  
  socket.removeAllListeners('error')
  socket.on('error', function(e) {
    peer.node.logger.error('Error in socket '+peer.remoteIp)
    peer.close()
  })
}
module.exports = Peer

/**
Sends raw $data to peer
*/
Peer.prototype.send = function(data) {
  this.socket.write(data);
}

/**
Closes the underlying socket and removes peers from peerlist
*/
Peer.prototype.close = function() {
  this.socket.end();
  this.node.peers.remove(this);
}