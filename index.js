var net  = require('net')
  , Node = require('./lib/node')
  , Netmask = require('netmask').Netmask
  , os = require('os')

/**
Creates a node and binds it to a server
*/
exports.createNode = function createNode(opts) {
  return new Node(opts)
}

exports.localIp = function(subnet) {
  //Determine my IP
  var interfaces = os.networkInterfaces()
    , block = new Netmask(subnet) // https://npmjs.org/package/netmask
    , ip
  for(var name in interfaces) {
    if(this.remoteAddress) break
    for(var i in interfaces[name]) {
      if(interfaces[name][i].family == 'IPv6') continue
      if(!block.contains(interfaces[name][i].address)) continue
      return interfaces[name][i].address
    }
  }
  
  throw new Error('Couldn\'t determine IP address')
}