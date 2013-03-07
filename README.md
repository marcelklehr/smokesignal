# smokesignal

Scale your real-time app with p2p message passing.

* *Simple*: Broadcast events or just speak to a specific peer.
* *Autonomic*: Have your nodes gather and reorder automatically.
* *Configurable*: If you provide your node with a network entry point, it'll join some peers automatically. Alternatively you can simply connect manually.
* *Self-healing*: Auto-detection of netsplits and disconnect events.

This is currently in development. Most of the things below work already, though...

```
npm install smokesignal
```

## Synopsis

```js
var smoke = require('smokesignal')


var node = smoke.createNode({
  port: parseInt(process.argv[2]) || 13
, entrance: {port: 13, address:'192.168.2.100'} // the address of a known node
, localNetmask: '192.168.2.1/255.255.255.0' // Supply it with your subnet mask and it'll figure out your IP
})

// listen on network events

node.on('connect', function() {
  console.log('Connected.')
  
  // and broadcast stuff
  node.broadcast.emit('my network', 'HEYO! I\'m here')
})

node.on('disconnect', function() {
  console.log('mh. Disonnected.')
})

node.broadcast.on('my network', function(msg) {
  console.log(msg)
})
```

Check out the complete [chat app example](https://github.com/marcelklehr/smokesignal/tree/develop/example/ChatApp)!