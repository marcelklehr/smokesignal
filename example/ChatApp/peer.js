var smoke = require('../../index')

process.stdin.setEncoding('utf8')

var node = smoke.createNode({
  port: parseInt(process.argv[2]) || 14
, address: smoke.localIp('192.168.2.1/255.255.255.0')
, seeds: [{port: 14, address:'192.168.2.100'}] //<-- You may need to change this address!
})

console.log('Port', node.options.port)
console.log('IP', node.options.address)
console.log('ID', node.id)

console.log('Connecting...');

node.on('connect', function() {
  console.log('Connected. Happy chatting!\n');
})

node.on('disconnect', function() {
  console.log('Disconnected. Sorry.');
})

// Send message
process.stdin.pipe(node.broadcast).pipe(process.stdout)

node.on('error', function(e) {throw e})
node.start()