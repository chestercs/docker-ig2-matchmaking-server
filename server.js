// Load the net module to create a tcp server.
var net = require('net');

var clients = {};
var client_id_counter = 0;
var pinginterval = 10000;
var pingtimeout = 15000;

function client(socket, clientid)
{
	this.socket = socket;
	this.id = clientid;
	//this.ports = {};
	this.packet = {}
	this.readstate = 0;
	this.packetsize = 0;
	this.connectedclients = {}
	this.sizebuf = Buffer.alloc(0);
	this.databuf = Buffer.alloc(0);
};

client.prototype.disconnect = function(peerid, clearconnection)
{
	if (peerid==undefined)
		return;

	if (clearconnection && this.timerid)
	{
		clearTimeout(this.timerid);
		this.timerid = 0;
	}

	for (var key in this.connectedclients) {
		if (this.connectedclients.hasOwnProperty(key) && this.connectedclients[key]) {
			if (peerid && peerid!=key)
				continue;

			var client = clients[key];
			if (client && client.sendstring)
			{
				client.connectedclients[this.id] = 0;
				this.connectedclients[client.id] = 0;
				client.sendstring("disconnected:"+this.id);
//				console.log("disconnected:"+this.id + " to:"+client.id);		///!///
			}
		}
	}

	if (clearconnection)
		delete this.gameparams;
}

client.prototype.sendstring = function(msg)
{
	if (this.socket.closed)
		return;

	var len = Buffer.alloc(4);
	len.writeUInt32LE(msg.length);
	var packet = Buffer.concat([len, Buffer.from(msg)]);
	this.socket.write(packet);
	//console.log("msg sent to " + this.id + ": " + msg);
}

client.prototype.responsemsg = function(params)
{
	if ((params.cmd=="send") && params.data)
	{
		var msg = "fc:"+this.id + ",fp:"+params.fp + ",tp:"+params.tp+"|"+params.data;
		if (params.tc=="0")
		{
			for (var key in clients) {
				if (clients.hasOwnProperty(key)) {
					if ((key==this.id) || !clients[key].sendstring) continue;
					var client = clients[key];
					client.sendstring(msg);
				}
			}
			this.sendstring("ack:ok");
		}
		else
		{
			var client = clients[params.tc];
			if (client && client.sendstring)
			{
				client.sendstring(msg);
				this.sendstring("ack:ok");
			}
			else
				this.sendstring("ack:error");
		}
	}
	else if (params.cmd=="info")
	{
		this.gameparams = {};
		for (var property in params) {
			if (params.hasOwnProperty(property) && (property!='cmd')) {
				this.gameparams[property] = params[property];
			}
		}
		
		this.gameparams['nam'] = (new Buffer(this.gameparams['nam'], 'base64')).toString('utf8');
		
//		console.log("game info received from client " + this.id + ":");
//		for (var property in this.gameparams) {
//			if (this.gameparams.hasOwnProperty(property)) {
//				console.log(property + ": " + this.gameparams[property]);
//			}
//		}

	}
	else if (params.cmd=="query")
	{
		//console.log("query request from client " + this.id);

		if (!params.str) params.str = "";
		params.str = params.str.toLowerCase();
		var resp = [];
		var counter = 0;
		for (var key in clients) {
			if (clients.hasOwnProperty(key) && clients[key].gameparams && clients[key].gameparams.nam) {
				var pos = clients[key].gameparams.nam.toLowerCase().indexOf(params.str);
				if (pos !== -1)
				{
					var gp = {};
					for(var k in clients[key].gameparams) gp[k]=clients[key].gameparams[k];
					gp['sti'] = pos;
					gp['id'] = clients[key].id;
					if (gp['nam'])
						gp['nam'] = (new Buffer(gp['nam'], 'utf8')).toString('base64');

					resp.push(gp);
					if (++counter>=100)		//max 100 items
						break;
				}
			}
		}

		counter = 0;
		var respstr = "gamelist:";
		for (var game in resp)
		{
			if (resp.hasOwnProperty(game)) {
				if (counter++) respstr += "|";
				var propcounter = 0;
				for (var property in resp[game]) {
					if (resp[game].hasOwnProperty(property)) {
						if (propcounter++) respstr += ",";
						respstr += property + ":" + resp[game][property];
					}
				}
			}
		}

		//console.log("query response to client " + this.id + ": " + respstr);

		this.sendstring(respstr);
	}
	else if ((params.cmd=="connect") && params.tc)
	{
		var client = clients[params.tc];
		if (client && client.sendstring)
		{
			this.connectedclients[client.id] = 1;
			client.connectedclients[this.id] = 1;
			client.sendstring("fc:"+this.id + ",fp:"+params.fp + ",tp:"+params.tp + "|!connect!");
			this.sendstring("ack:ok");
		}
		else
			this.sendstring("ack:error");
	}
	else if (params.cmd=="disconnect")
	{
		//console.log("disconnect:"+this.id+" from:" + params.fc);		///!///
		this.disconnect(params.fc, false);
		this.sendstring("ack:ok");
	}
	else if (params.pong)
	{
		this.pongid = params.pong;
		this.startping();
	}
}

client.prototype.addmsgpart = function(msg)
{
	while (msg.length)
	{
		switch (this.readstate)
		{
			case 0:		//receiveing size
			{
				var actlength = Math.min(msg.length, 4-this.sizebuf.length);
				this.sizebuf = Buffer.concat([this.sizebuf, msg.slice(0, actlength)]);
				msg = msg.slice(actlength, msg.length);
				if (this.sizebuf.length==4)
				{
					this.packetsize = this.sizebuf.readUInt32LE(0);
					this.readstate = 1;
				}
			} break;

			case 1:		//receiving packet
			{
				var actlength = Math.min(msg.length, this.packetsize - this.databuf.length);
				this.databuf = Buffer.concat([this.databuf, msg.slice(0,actlength)]);
				msg = msg.slice(actlength, msg.length);
				if (this.databuf.length==this.packetsize)
				{
					var strmsg = this.databuf.toString();
					//console.log("msg received from " + this.id + ": " + strmsg);
					var params = parsemsg(strmsg);
					this.readstate = 0;
					this.databuf = Buffer.alloc(0);
					this.sizebuf = Buffer.alloc(0);
					this.responsemsg(params);
				}
			}
			break;
		}
	}
}

client.prototype.ping = function()
{
	if (this.sendstring)
	{
		var client = this;
		if (!this.pingid) this.pingid = 0;
		this.pingid++;
		this.sendstring("ping:"+this.pingid);
		this.timerid = setTimeout(function()
		{
			console.log("Connection timed out: " + client.id);
			if (client.socket)
				client.socket.destroy();
		}, pingtimeout);
	}
}

client.prototype.startping = function()
{
	var client = this;
	if (this.timerid)
		clearTimeout(this.timerid);
	this.timerid = setTimeout(function() { client.ping(); }, pinginterval);
}

function parsemsg(msg)
{
	var res = {};
	var n = msg.indexOf("|");
	//if (n<0)
	//	return res;
	var header = (n>=0)?msg.substr(0, n):msg;
	var params = header.split(",");
	for (var i=0; i<params.length; i++)		
	{
		var keyval = params[i].split(":");
		if (keyval.length>1)
			res[keyval[0]] = keyval[1];
	}

	if (n>=0)
		res["data"] = msg.substr(n+1);
	return res;
}

var server_out = net.createServer(function (socket) {
	var clientid = ++client_id_counter;
	clients[clientid] = new client(socket, clientid);
	console.log("Connection from " + socket.remoteAddress + " (id:"+clientid+")");

	var idbuf = Buffer.alloc(4);
	idbuf.writeUInt32LE(clientid, 0);
	socket.write(idbuf);
	
	socket.on('data', function(d) {
		clients[clientid].addmsgpart(d);
	});

	socket.on('close', function(had_error) {
		console.log("Connection closed (" + socket.remoteAddress + " id:" + clientid + ")");
		socket.closed = true;
		
		var client = clients[clientid];
		if (client)
		{
			if (client.disconnect)
				client.disconnect(0, true);
			delete clients[clientid];
		}
	});
	
	socket.on("error", function(err) {
		console.log("Connection broken (" + socket.remoteAddress + " id:" + clientid + ")");
		socket.closed = true;
		
		var client = clients[clientid];
		if (client)
		{
			if (client.disconnect)
				client.disconnect(0, true);
			delete clients[clientid];
		}
	});
	
	clients[clientid].startping();	
});

//Test data!
/*
clients[10001] = {'id':10001,'gameparams': {'nfr':1,'nam':'server10001','lng':1} };
clients[10002] = {'id':10002,'gameparams': {'nfr':2,'nam':'server10002','lng':2} };
clients[10003] = {'id':10003,'gameparams': {'nfr':2,'nam':'server10003','lng':3} };
clients[10004] = {'id':10004,'gameparams': {'nfr':3,'nam':'server10004','lng':1} };
clients[10005] = {'id':10005,'gameparams': {'nfr':2,'nam':'server10005','lng':1} };
clients[10006] = {'id':10006,'gameparams': {'nfr':2,'nam':'server10006','lng':2} };
clients[10007] = {'id':10007,'gameparams': {'nfr':3,'nam':'server10007','lng':2} };
clients[10008] = {'id':10008,'gameparams': {'nfr':2,'nam':'server10008','lng':1} };
clients[10009] = {'id':10009,'gameparams': {'nfr':1,'nam':'server10009','lng':6} };
clients[10010] = {'id':10010,'gameparams': {'nfr':2,'nam':'server10010','lng':4} };
clients[10011] = {'id':10011,'gameparams': {'nfr':4,'nam':'server10011','lng':4} };
clients[10012] = {'id':10012,'gameparams': {'nfr':2,'nam':'server10012','lng':1} };
clients[10013] = {'id':10013,'gameparams': {'nfr':6,'nam':'server10013','lng':2} };
clients[10014] = {'id':10014,'gameparams': {'nfr':5,'nam':'server10014','lng':2} };
clients[10015] = {'id':10015,'gameparams': {'nfr':1,'nam':'server10015','lng':5} };
clients[10016] = {'id':10016,'gameparams': {'nfr':2,'nam':'server10016','lng':2} };
clients[10017] = {'id':10017,'gameparams': {'nfr':2,'nam':'server10017','lng':3} };
clients[10018] = {'id':10018,'gameparams': {'nfr':3,'nam':'server10018','lng':1} };
clients[10019] = {'id':10019,'gameparams': {'nfr':2,'nam':'server10019','lng':1} };
clients[10020] = {'id':10020,'gameparams': {'nfr':2,'nam':'server10020','lng':2} };
clients[10021] = {'id':10021,'gameparams': {'nfr':3,'nam':'server10021','lng':2} };
clients[10022] = {'id':10022,'gameparams': {'nfr':2,'nam':'server10022','lng':1} };
clients[10023] = {'id':10023,'gameparams': {'nfr':1,'nam':'server10023','lng':1} };
clients[10024] = {'id':10024,'gameparams': {'nfr':2,'nam':'server10024','lng':4} };
clients[10025] = {'id':10025,'gameparams': {'nfr':4,'nam':'server10025','lng':5} };
clients[10026] = {'id':10026,'gameparams': {'nfr':2,'nam':'server10026','lng':6} };
clients[10027] = {'id':10027,'gameparams': {'nfr':6,'nam':'server10027','lng':2} };
clients[10028] = {'id':10028,'gameparams': {'nfr':5,'nam':'server10028','lng':2} };
clients[10029] = {'id':10029,'gameparams': {'nfr':4,'nam':'xserver','lng':5} };
clients[10030] = {'id':10030,'gameparams': {'nfr':2,'nam':'s34xofij','lng':6} };
clients[10031] = {'id':10031,'gameparams': {'nfr':6,'nam':'2aaabcdeefu','lng':2} };
clients[10032] = {'id':10032,'gameparams': {'nfr':5,'nam':'33335huiDp','lng':2} };
*/

server_out.listen(1611, "0.0.0.0");

console.log("TCP server listening on port at localhost.");
