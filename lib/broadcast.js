var EventEmitter = require('events').EventEmitter
  , crypto = require('crypto')

function Broadcast(node) {
  //The IDs of all broadcast packets this node has seen
  this.knownPackets = {}
  this.node = node

  node.peers.on('add', function(peer) {
    peer.socket.data(['smoke', 'broadcast'], this.onBroadcast.bind(this, peer))
    peer.socket.data(['smoke', 'peer request'], this.node.onPeerRequest.bind(this.node, peer))
    //peer.socket.data(['smoke', 'ping'], this.node.onPing.bind(this, peer))
  }.bind(this))
}

module.exports = Broadcast
Broadcast.prototype = new EventEmitter
Broadcast.prototype.constructor = Broadcast

Broadcast.prototype.$emit = Broadcast.prototype.emit // emit is overridden below..

/**
 * Broadcasts an event of $type with $data to all peers except $except
 */
Broadcast.prototype.sendPacket = function(type, data, except) {
  var packet = this.createPacket(data)
  
  this.knownPackets[packet.id] = true
  setTimeout(function() {
    // don't leak memory! Delete all entries after 60s
    delete this.knownPackets[data.id]
  }.bind(this), 1000*60)
  
  this.node.peers.list.forEach(function(peer) {
    if(peer === except) return
    peer.socket.send(type, packet)
  })
}

Broadcast.prototype.emit = function(event, data) {
  var data = Array.prototype.slice.apply(arguments)
  this.sendPacket(['smoke', 'broadcast'], data)
}

Broadcast.prototype.onBroadcast = function(peer, packet) {
  if(this.knownPackets[packet.id]) return

  var id = packet.id.split('-')
    , peerId = id[0]
    , messageId = id[1]
    , hash = id[2]
    , date = id[3]
  
  if(hash != Broadcast.hash(packet.data)) return peer.close()
  
  this.sendPacket(['smoke', 'broadcast'], packet, peer)
  
  this.$emit.apply(this, packet.data)
}

Broadcast.prototype.createPacket = function(data) {
  var uuid = Math.abs(Math.random() * Math.random() * Date.now() | 0).toString(36)
           + Math.abs(Math.random() * Math.random() * Date.now() | 0).toString(36)

  var hash = Broadcast.hash(data)
  
  return {id: this.node.id+'-'+uuid+'-'+hash, data:data}
}

Broadcast.hash = function(obj) {
  var hash = crypto.createHash('md5')
  hash.update(JSON.stringify(obj))
  return hash.digest('hex')
}