var crypto = require('crypto')
  , net    = require('net')
  , assert = process.assert

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
  try {
    assert(typeof(pkg.id) == 'string')
    assert(typeof(pkg.type) ==  'string')
    assert(typeof(pkg.content) !=  'undefined')
    assert(Packager.hash(pkg.content) == function(){var h; if((h = pkg.id.match(/^.+?-.+?-(.+?)$/)) !== null) return h[1]; return null; }())
    return true
  }catch(e) {
    return false
  }
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
  try {
    assert(Packager.isValid(pkg))
    assert(pkg.type == 'connect')
    assert(typeof(pkg.content) == 'object')
  }catch(e) {
    return false
  }
  
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
  try {
    assert(this.node.peers.inList(socket))
    assert(Packager.isValid(pkg))
    assert(pkg.type == 'broadcast')
  }catch(e) {
    return false
  }
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
  try{
    assert(this.node.peers.inList(socket))
    assert(Packager.isValid(pkg))
    assert(pkg.type == 'ping')
    
    assert(typeof(pkg.content) == 'object')
    assert(net.isIP(pkg.content.targetIp))
    
    assert(typeof(pkg.content.origin) == 'object')
    assert(net.isIP(pkg.content.origin.remoteAddress))
    assert(typeof(pkg.content.origin.remotePort) == 'number')
    assert(pkg.content.origin.remotePort % 1 === 0)
  }catch(e) {
    return false
  }
  
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
  try {
  assert(Packager.isValid(pkg))
  assert(pkg.type == 'pong')
  assert(typeof(pkg.content) == 'object')
  assert(pkg.content.respondsTo && this.node.sent.pings[pkg.content.respondsTo])
  }catch(e) {
    return false
  }
  return true
}