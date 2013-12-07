var DuplexStream = require('stream').Duplex
  , crypto = require('crypto')

function Broadcast(node) {
  DuplexStream.apply(this)

  //The IDs of all broadcast packets this node has seen
  this.knownPackets = {}
  this.node = node

  node.peers.on('add', function(peer) {
    peer.socket.data(['smoke', 'broadcast'], this.onPacket.bind(this, ['smoke', 'broadcast'], peer))
    peer.socket.data(['smoke', 'peer request'], this.onPacket.bind(this, ['smoke', 'peer request'], peer))
    peer.socket.data(['smoke', 'ping'], this.onPacket.bind(this, ['smoke', 'ping'], peer))
  }.bind(this))
}

module.exports = Broadcast

Broadcast.prototype = Object.create(DuplexStream.prototype, { constructor: { value: Broadcast }})

Broadcast.prototype._write = function(chunk, encoding, cb) {
  this.sendPacket(['smoke','broadcast'], this.createPacket(chunk.toString('base64')))
  cb()
}

Broadcast.prototype._read = function() {
  // no op
}

/**
 * Broadcasts an event of $type with $data to all peers except $except
 */
Broadcast.prototype.send = function(type, data, except) {
  var packet = this.createPacket(data)
  return this.sendPacket(type, packet, except)
}

Broadcast.prototype.sendPacket = function(type, packet, except) {
  this.knownPackets[packet.id] = true
  setTimeout(function() {
    // don't leak memory! Delete all entries after 60s
    delete this.knownPackets[packet.id]
  }.bind(this), 1000*60)
  
  this.node.peers.list.forEach(function(peer) {
    if(peer === except) return
    peer.socket.send(type, packet)
  })
  
  return packet.id
}

Broadcast.prototype.onPacket = function(type, peer, packet) {
  if(!packet.id) return
  if(!packet.data) return
  if(this.knownPackets[packet.id]) return

  var id = packet.id.split('-')
    , peerId = id[0]
    , messageId = id[1]
    , hash = id[2]
    , date = id[3]

  this.knownPackets[packet.id] = true
  setTimeout(function() {
    // don't leak memory! Delete all entries after 60s
    delete this.knownPackets[packet.id]
  }.bind(this), 1000*60)
  
  if(hash != Broadcast.hash(packet.data)) return

  if(this.listeners[type[1]]) this.listeners[type[1]].call(this, packet, peer)
}

Broadcast.prototype.listeners = {
  broadcast: function(packet, peer) {
    this.push(new Buffer(packet.data, 'base64'))
    this.sendPacket(['smoke', 'broadcast'], packet, peer)
  },
  ping: function(packet, peer) {
    this.node.onPing(packet, peer)
  },
  'peer request': function(packet, peer) {
    var accepted = this.node.onPeerRequest(packet.data)
    if(!accepted) this.sendPacket(['smoke', 'peer request'], packet, peer)
  }
}

Broadcast.prototype.createPacket = function(data) {
  var uuid = Math.abs(Math.random() * Math.random() * Date.now() | 0).toString(36)
           + Math.abs(Math.random() * Math.random() * Date.now() | 0).toString(36)

  var hash = Broadcast.hash(data)
  
  return {id: this.node.id+'-'+uuid+'-'+hash, data: data}
}

Broadcast.hash = function(obj) {
  var hash = crypto.createHash('md5')
  hash.update(JSON.stringify(obj))
  return hash.digest('hex')
}