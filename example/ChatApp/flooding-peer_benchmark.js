var smoke = require('../../index')

var node = smoke.createNode({
  port: parseInt(process.argv[2]) || 14
, entrance: {port: 14, address:'192.168.2.100'}
, localNetmask: '192.168.2.1/255.255.255.0'
})


console.log('Connecting...');

node.on('connect', function() {
  console.log('Connected. Happy flooding!\n');
  for(var i=0; i<10000; i++) setTimeout(function(i) { node.broadcast.emit('chat', 'floüod!'+i) }.bind(this, i), 30*i)
})

node.on('disconnected', function() {
  console.log('Disconnected. Sorry.');
})

node.start()