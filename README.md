# ![smokesignal](https://raw.github.com/marcelklehr/smokesignal/develop/smokesignal.png)

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
  // Hey, now we have at least one peer!
  
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

## API

### smoke.createNode(opts:object)
Creates a new node.
Options:

 * `address`: (compulsory) Your current ip address
 * `port`: (compulsory) Port to bind at
 * `minPeerNo`: (optional; default: 3) how many peers this node will actively try to bond with -- you can always connect to more manually!
 * `maxPeerNo: (optional; default: 5) how many peers this node will accept at max. Infinity for no limit
 * `seeds`: (optional) an array of known nodes, that are part of the network, e.g. `{port: 0, address: '127.0.0.1'}`
 * `pingTimeout`: (optional; default: 3000)  The time span in ms after which we consider the ping as failed
 * `logger`: (optional; default: empty object) An object that may provide the following methods: trace, debug, info, warn, error, fatal

### Class: Node

#### Event: connect
Emitted when we have at least one peer.

#### Event: disconnect
Emitted when the last peer disconnects.

#### Node#broadcast
A socket.io-like remote Event Emitter.

Use `Node#broadcast#emit()` to emit an event to all nodes in the network.

Use `Node#broadcast#on()` to listen on events.

#### Node#start()
Starts the node. The tcp server will be bound to the specified port and the node will try to enter the network.

#### Node#stop()
Stops the node. Will disconnect all peers and shut down the tcp server.

#### Node#addPeer(address:string, port:int)
Tries to connect to the node at the specified address and add it as a peer.
This should allow people to pass a callback..

#### Node#peerlist
An instance of `Peerlist`

### Class: Peerlist

#### Event: add
Emitted when a peer is added. This event is triggered with the corresponding peer object as the first parameter.

#### Event: remove
Emitted when a peer is removed. This event is triggered with the corresponding peer object as the first parameter.

### Class: Peer

#### Peer#remoteAddress
The remote address of this peer.

#### Peer#remotePort
The remote port of this peer.

#### Peer#id
The smokesignal id of this peer.

#### Peer#emit(event:string, [param:mixed], [param:mixed], ...)
Emit an event to this peer. The other end will recieve this event on the peer object that represents this node.

#### Peer#on(event:string, handler:function([param:mixed], [param:mixed], ...))
Listens on an event that was emitted on the peer object that represents this node on the other end of this peer.

## Todo

 * Use event-loop-friendly nextTick call(back)s
 * Maybe make options.port optional, so it just uses an available port
 
## Legal
(c) 2012-2013 Marcel Klehr
MIT License

## Changelog

0.1.0
 * Don't depend on log4js