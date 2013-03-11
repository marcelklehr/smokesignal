# smokesignal

Scale your real-time app with p2p message passing.

* *Simple*: Broadcast events or just speak to a specific peer.
* *Autonomic*: Have your nodes gather and reorder automatically.
* *Flexible*: You define, how your nodes will behave.
* *Self-healing*: Auto-detection of netsplits and disconnect events.

Smokesignal is not a gossip protocol. It does not implement p2p data replication for you. It is a plain, flexible peer-to-peer event passing solution, onto which you can easily build your own replication model.

You can connect to new peers manually or allow your node to search for peers automatically. You can listen on peer list events to get notfied when your node added or removed a peer. You can emit events directly to a specific peer or broadcast them to the whole network. If you want, your node will automatically ping the network seed(s) once in a while, to detect netsplits and resolve them automatically.  
Nodes emit a `connect` event when the node adds the first peer, and a `disconnect` event, when the last peer disconnects. If you have specified some seeds, your node will automatically rejoin the network in this case.

This project is in development, so be prepared that things might break in some situations.

```
npm install smokesignal
```

## Synopsis

```js
var smoke = require('smokesignal')


var node = smoke.createNode({
  port: 8495
, address: smoke.localIp('192.168.2.1/255.255.255.0') // Tell it your subnet and it'll figure out the right IP for you
, seeds: [{port: 13, address:'192.168.2.100'}] // the address of a seed (a known node)
})

// listen on network events...

node.on('connect', function() {
  // Hey, now have at least one peer!
  
  // ...and broadcast stuff
  node.broadcast.emit('chat', 'HEYO! I\'m here')
})

node.on('disconnect', function() {
  // Bah, all peers gone.
})

node.broadcast.on('chat', function(msg) {
  // oho, a chat message!
})

// Start the darn thing
node.start()

// mah, i'd rather stop it
node.stop()
```

Check out the complete [chat app example](https://github.com/marcelklehr/smokesignal/tree/develop/example/ChatApp)!

## Todo

 * Use event-loop-friendly nextTick call(back)s
 * Remove log4js dep