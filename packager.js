var crypto = require('crypto')
  , net    = require('net')

function Packager(node) {
  this.node = node
}

module.exports = Packager

Packager.prototype.generateId = function generateId(content) {
  return this.node.opts.localAddress+'-'+Math.round(Date.now()/1000)+'-'+Packager.hash(content)
}

Packager.prototype.build = function build(type, content) {
  var data = {type: type, id: this.generateId(content), content: content}
  return {str: JSON.stringify(data), json: data}
}

Packager.hash = function hash(o) {
  var hash = crypto.createHash('md5')
  hash.update(JSON.stringify(o))
  return hash.digest('hex')
}

Packager.isValid = function isValid(pkg) {
  if(typeof(pkg.id) !== 'string') return false
  if(pkg.type != 'connect' && pkg.type != 'broadcast' && pkg.type != 'response') return false
  if(typeof(pkg.content) ==  'undefined') return false
  if(Packager.hash(pkg.content) == function(){var h; if(h = pkg.id.match(/^.+?-.+?-(.+?)$/) !== null) return h[1]; return null; }()) return false
  return true
}

Packager.prototype.isConnect = function(pkg, socket) {
  if(!Packager.isValid(pkg)) return false
  if(pkg.type != 'connect') return false
  if(!net.isIP(pkg.content.remoteAddress)) return false
  if(typeof(pkg.content.remotePort) != 'number') return false
  return true
}

Packager.prototype.isBroadcast = function(pkg, socket) {
  if(!this.node.peers.inList(socket)) return false
  if(!Packager.isValid(pkg)) return false
  if(pkg.type != 'broadcast') return false
  return true
}

Packager.prototype.isResponse = function(pkg, socket) {
  if(!Packager.isValid(pkg)) return false
  if(pkg.type != 'response') return false
  if(!pkg.content.respondsTo) return false
  if(!this.node.openConnects.some(function(id){ return pkg.content.respondsTo == id; })) return false
  if(this.node.peers.inList(socket)) return false
  if(this.node.peers.isFull()) return false
  return true
}