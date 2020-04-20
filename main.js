const fs = require("fs");
const http = require("http");
const GPIO = require("onoff").Gpio;
const { getSunrise, getSunset } = require('sunrise-sunset-js')

const LONG = -0.4771748;
const LAT = 51.333199;

let RAVE_PULSE = 250;
let server_dat = readDatFile();
let rave_id = -1;

//set up the GPIO pin 22 to turn on/off the lights
const LIGHTS = new GPIO(22, 'out');

async function handler(req, res){
	let route = req.url.toLowerCase();
	let post = await getPostDat(req);


	if(route === "/" || route === "/index.html"){
		let page = fs.readFileSync("./index.html")+"";
		res.writeHead(200);
		res.end(page.replace("SERVER_DAT.ON_TIME", JSON.stringify(server_dat.on)));
	}
	

	//POST routes
	if(req.method !== "POST"){
		res.writeHead(405);
		return res.end("POST method route");
	}

	if(route === "/api/lights/on"){
		set_lights(req, res, 1);
	}else if(route === "/api/lights/off"){
		set_lights(req, res, 0);
	}else if(route === "/api/lights/set_on"){
		editDatFile("on", post);//save the new time (should really be checked but only I will use this so security isnt really needed)
		res.writeHead(200);
		res.end("OK");
	}else if(route === "/api/lights/rave"){
		if(post.interval)
			RAVE_PULSE = post.interval;

		if(isNaN(RAVE_PULSE) || RAVE_PULSE < 50)
			RAVE_PULSE = 50;

		rave(req, res);
	}else{
		res.writeHead(404);
		res.end("not found");
	}
}

function set_lights(req, res, state){
	LIGHTS.writeSync(state);
	res.writeHead(200);
	res.end("OK");
}

function rave(req, res){
	if(rave_id === -1){
		startRave();
	}else{
		clearInterval(rave_id);
		rave_id = -1;
		LIGHTS.writeSync(1);
	}
	res.writeHead(200);
	res.end("OK");
}

let morning = new Date().getHours() < 12;
const AUTO_TOGGLE = 30*60*1000; //toggle lights with 30 min buffer to sun

setInterval(function(){
	let now = new Date();

	//in england, sun wont set before midday and wont rise after midday
	//therefore we can just check for sunrise in morning and sunset at night
	if(morning && now.getHours() < 12){
		let sunrise = getSunrise(LAT, LONG).getTime();
		//sun rises at sunrise. We will turn the lights off x mins after sunrise.
		//if sunrise time + x mins is less than now (in the past) then turn lights off

		if(sunrise + AUTO_TOGGLE < now.getTime()){
			//turn off the lights.
			LIGHTS.writeSync(0);
			//We have done what we need to for the morning. Now we wait for night
			morning = false;
		}
	}else if(!morning && now.getHours() > 12){
		let sunset = getSunset(LAT, LONG).getTime();
		//sun sets at sunset. We will turn the lights on x mins before sunrise
		//if sunrise - x is less than now (in the past) turn on the lights

		if(sunset - AUTO_TOGGLE < now.getTime()){
			LIGHTS.writeSync(1);
			morning = true;
		}
	}
	
	//turn on the lights at the set time ( && morning -> if the sun has already risen, dont turn them on )
	let on_time = server_dat["on"];
	if(!!on_time){//if on_time is set
		if(on_time.hour === now.getHours() && on_time.min === now.getMinutes() && morning){
			LIGHTS.writeSync(1);
		}
	}
	
}, 60*1000);

function startRave(){
	rave_id = setInterval(function(){
		let on = LIGHTS.readSync() == 1;
		if(on){
			LIGHTS.writeSync(0);
		}else{
			LIGHTS.writeSync(1);
		}
	}, RAVE_PULSE);
}

//read and write to the server.dat file
function readDatFile(){
	let data = fs.readFileSync("server.dat");
	if(!data)
		return {}
	return JSON.parse(data);
}

function writeDatFile(data){
	server_dat = data;
	data = JSON.stringify(data);
	fs.writeFileSync("server.dat", data);
}

function editDatFile(key, val){
	let current = readDatFile();
	current[key] = val;
	writeDatFile(current);
}



//Extract post data from a request
async function getPostDat(req) {
	//get the post data sent by the client
	return new Promise(function (resolve) {
		let body = '';
	
	        req.on('data', function (data) {
	        	body += data;
	
	                // Too much data sent
	                if (body.length > 1e6)
	                	req.connection.destroy();
	                });
	
			//resolve the data back to the parent function, returning it as a JSON object
			req.on('end', function () {
			if (body){
				try {
					resolve(JSON.parse(body));
				} catch (e) {
					resolve({})
				}
			}else{
				resolve({});
			}
		});
	})
}


let server = http.createServer();

server.addListener("request", handler);
server.listen(80);

console.log("Listening on port 80");
