var crypto = require('crypto')
  , net    = require('net')

function Packager(node) {
  this.node = node
}

module.exports = Packager

Packager.hash = function hash(o) {
  var hash = crypto.createHash('md5')
  hash.update(JSON.stringify(o))
  return hash.digest('hex')
}

Packager.prototype.generateId = function generateId(content) {
  return this.node.opts.localIp+'-'+Date.now()+'.'+process.hrtime()[1]+'-'+Packager.hash(content)
}

Packager.prototype.build = function build(type, content) {
  var data = {type: type, id: this.generateId(content), content: content}
  return {str: JSON.stringify(data), json: data}
}

Packager.isValid = function isValid(pkg) {
  if(typeof(pkg.id) !== 'string') return false
  if(typeof(pkg.type) ==  'string') return false
  if(typeof(pkg.content) ==  'undefined') return false
  if(Packager.hash(pkg.content) == function(){var h; if(h = pkg.id.match(/^.+?-.+?-(.+?)$/) !== null) return h[1]; return null; }()) return false
  return true
}

/**
Checks if the passed $package is a CONNECT:

{ id: "fromIP-timestamp-contenthash"
, type: "connect"
, content: { remoteAddress: '0.0.0.0'
           , remotePort: 0 }
}

or

{ id: "fromIP-timestamp-contenthash"
, type: "connect"
, content: { respondsTo: "fromIP-timestamp-contenthash" }
}
*/
Packager.prototype.isConnect = function(pkg, socket) {
  if(!Packager.isValid(pkg)) return false
  if(pkg.type != 'connect') return false
  if(typeof(pkg.content) != 'object') return false
  
  if(net.isIP(pkg.content.remoteAddress) && typeof(pkg.content.remotePort) == 'number' && pkg.content.remotePort % 1 === 0) {
    return true
  }else if(pkg.content.respondsTo && this.node.sent.connects[pkg.content.respondsTo]) {
    return true
  }else return false
}

/**
Checks if the passed $package is a RESPONSE:
{ id: "fromIP-timestamp-contenthash"
, type: "broadcast"
, content: { }
}
*/
Packager.prototype.isBroadcast = function(pkg, socket) {
  if(!this.node.peers.inList(socket)) return false
  if(!Packager.isValid(pkg)) return false
  if(pkg.type != 'broadcast') return false
  return true
}

/**
Checks if the passed $package is a PING:
{ id: "fromIP-timestamp-contenthash"
, type: "ping"
, content: { targetIp: "0.0.0.0" 
           , origin: { remoteAddress: '0.0.0.0'
                     , remotePort: 0 }
}
}
*/
Packager.prototype.isPing = function(pkg, socket) {
  if(!this.node.peers.inList(socket)) return false
  if(!Packager.isValid(pkg)) return false
  if(pkg.type != 'ping') return false
  
  if(typeof(pkg.content) != 'object') return false
  if(!net.isIP(pkg.content.targetIp)) return false
  
  if(typeof(pkg.content.origin) != 'object') return false
  if(!net.isIP(pkg.content.origin.remoteAddress)) return false
  if(typeof(pkg.content.remotePort) != 'number') return false
  if(pkg.content.remotePort % 1 !== 0) return false
  
  return true
}

/**
Checks if the passed $package is a PONG:
{ id: "fromIP-timestamp-contenthash"
, type: "pong"
, content: { respondsTo: "fromIP-timestamp-contenthash" }
}
*/
Packager.prototype.isPong = function(pkg, socket) {
  if(!Packager.isValid(pkg)) return false
  if(pkg.type != 'pong') return false
  if(typeof(pkg.content) != 'object') return false
  if(!pkg.content.respondsTo || !this.node.sent.pings[pkg.content.respondsTo]) return false
  return true
}