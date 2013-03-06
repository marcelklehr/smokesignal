var smoke = require('../../index')
process.stdin.setEncoding('utf8')

var node = smoke.createNode({
  port: parseInt(process.argv[2]) || 14
, entrance: {port: 14, address:'192.168.2.100'}
, localNetmask: '192.168.2.1/255.255.255.0'
})

console.log('Port', parseInt(process.argv[2]) || 14)
console.log('IP', node.remoteAddress)
console.log('ID', node.id)

var prompt = function() {
  process.stdin.resume()
  process.stdout.write('>')
}

console.log('Connecting...');

node.on('connect', function() {
  console.log('Connected. Happy chatting!\n');
  prompt()
})

node.on('disconnect', function() {
  console.log('Disconnected. Sorry.');
  process.stdin.pause()
})

// Send message
process.stdin.on('data', function(d) {
  node.broadcast.emit('chat', node.remoteAddress+': '+d);
  prompt()
})

// Receive message
node.broadcast.on('chat', function(msg) {
  if(msg.trim() == '') return
  process.stdout.write("\n"+msg)
  prompt()
})

node.on('error', function(e) {throw e})
node.start()