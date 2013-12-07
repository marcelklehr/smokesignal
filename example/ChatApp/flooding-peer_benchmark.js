var smoke = require('../../index')

var node = smoke.createNode({
  port: parseInt(process.argv[2]) || 14
, address: smoke.localIp('192.168.2.1/255.255.255.0')
, seeds: [{port: 14, address:'192.168.2.100'}]
})


console.log('Connecting...');

node.on('connect', function() {
  console.log('Connected. Happy flooding!\n');
  for(var i=0; i<10000; i++) setTimeout(function(i) { node.broadcast.write('floüod!'+i) }.bind(this, i), 30*i)
})

node.on('disconnected', function() {
  console.log('Disconnected. Sorry.');
})

node.start()