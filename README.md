# ![smokesignal](https://raw.github.com/marcelklehr/smokesignal/develop/smokesignal.png)

Scale your real-time app with p2p message passing.

* *Simple*: Broadcast stuff or just speak to a specific peer.
* *Autonomic*: Have your nodes gather and reorder automatically.
* *Flexible*: You define, how your nodes will behave.
* *Self-healing*: Auto-detection of netsplits and disconnect events.

Smokesignal is not a gossip protocol. It does not implement p2p data replication for you. It is a plain, flexible peer-to-peer networking solution, onto which you can easily build your own replication model or use some event passing mechanism.

To faciliate this, direct connections from peer to peer as well as a network-wide broadcast (`Node.broadcast`) are simple duplex streams. Thus you can add all favours of stream-goodness, like [remote-events](https://github.com/dominictarr/remote-events), [p2p-rpc-stream](https://github.com/marcelklehr/p2p-rpc-stream), and [what not](https://github.com/substack/stream-handbook#read-more).

You can connect to new peers manually or allow your node to search for peers automatically. You can listen on peer list events to get notified when your node added or removed a peer.
If you want, your node will automatically ping the network seed(s) once in a while, to detect netsplits and resolve them automatically. 
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
  
  // ...and broadcast stuff -- this is an ordinary duplex stream!
  node.broadcast.write('HEYO! I\'m here')
})

node.on('disconnect', function() {
  // Bah, all peers gone.
})

// Broadcast is a stream
process.stdin.pipe(node.broadcast).pipe(process.stdout)

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
A duplex stream. Everyone will get what you write to it, and you'll get everything other people write to it also here.

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

#### Peerlist#inList(my_peer:Peer)
Returns a boolean indicating whether you're currently friends with that peer.

#### Peerlist#list
An array containing all nodes you're friends with. Please don't manipulate this directly. Instead, use Node#addPeer to try and connect to a node and Peer#close

### Class: Peer
A duplex stream. Write something to it and the other end will get it out of their representational Peer object for your node. Vice versa, if the other side writes something to their object, you'll be able read it here.

#### Event: end
Emitted when all ties to this node have been cut.

#### Peer#remoteAddress
The remote address of this peer.

#### Peer#remotePort
The remote port of this peer.

#### Peer#id
The network-wide id of this peer.

#### Peer#close
Cut's everything that ties you to this node.

## Todo

 * Use event-loop-friendly nextTick call(back)s
 * Maybe make options.port optional, so it just uses an available port
 
## Legal
(c) 2012-2013 Marcel Klehr
MIT License

## Changelog

0.2.1
 * Correctly inherit from EventEmitter

0.2.0
 * Replace socket.io-like interfaces with proper duplex streams

0.1.0
 * Don't depend on log4js