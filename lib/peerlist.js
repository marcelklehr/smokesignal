var EventEmitter = require('events').EventEmitter

function Peerlist(node) {
  EventEmitter.call(this);
  this.node = node
  this.list = []
}
module.exports = Peerlist
require('util').inherits(Peerlist, EventEmitter)

/**
 * Adds a new peer to the list
 */
Peerlist.prototype.add = function(peer) {
  this.list.push(peer)
  this.node.logger.info('Added new peer: '+peer.id)
  this.node.logger.debug('Peerlist ('+this.list.length+'/'+this.node.options.maxPeerNo+')\n', this.dump())
  this.emit('add', peer)
  return this
}

/**
 * Removes a peer from the list
 */
Peerlist.prototype.remove = function(peer) {
  peer = this.inList(peer)
  if(!peer) return
  
  this.list.splice(this.list.indexOf(peer), 1);
  this.node.logger.info('Removed peer: '+peer.id);
  this.node.logger.debug('Peerlist ('+this.list.length+'/'+this.node.options.maxPeerNo+')\n', this.dump())
  this.emit('remove', peer)
  return this
}

/**
 * Closes all connections to peers
 */
Peerlist.prototype.close = function() {
  var peers = this;
  this.list.forEach(function(peer) {
    peers.list.remove(peer)
    peer.close();
  })
  return this
}

/**
 * Returns an array containing the IDs of all peers
 */
Peerlist.prototype.dump = function() {
  return this.list.map(function(peer) {
    return peer.id
  })
}

/**
 * Returns a boolean indicating, whether the peer list is full
 */
Peerlist.prototype.isFull = function() {
  return !(this.list.length < this.node.options.maxPeerNo)
}

/**
 * Returns a boolean indicating, whether the peer list needs filling
 */
Peerlist.prototype.isSufficientlyFilled = function() {
  return !(this.list.length < this.node.options.minPeerNo)
}

/**
 * Checks if a socket is already in the list of peers and returns the peer, other wise returns false
 * 
 * @param checkPeer Either a string representing the peer id or a Peer object
 * @returns {Boolean} or {Peer}
 */
Peerlist.prototype.inList = function(checkPeer) {
  if('object' == typeof checkPeer) checkPeer = checkPeer.id
  if('string' == typeof checkPeer) return this.list.filter(function(peer) {return peer.id == checkPeer})[0] || false
  return false
}