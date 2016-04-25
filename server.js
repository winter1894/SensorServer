// server.js - NodeJS server for the PiThermServer project.

/* 

Parses data from DS18B20 temperature sensor and serves as a JSON object.
Uses node-static module to serve a plot of current temperature (uses highcharts).

Ref: www.cl.cam.ac.uk/freshers/raspberrypi/tutorials/temperature/

Matthew Winter, Devin Pacheco, Stanley Wang
*/

// Load node modules
var fs = require('fs');
var sys = require('sys');
var http = require('http');
var sqlite3 = require('sqlite3');

// Use node-static module to server chart for client-side dynamic graph
var nodestatic = require('node-static');

// Setup static server for current directory
var staticServer = new nodestatic.Server(".");

// Setup database connection for logging
var db1 = new sqlite3.Database('./piTemps.db');
var db2 = new sqlite3.Database('./piPressure.db');
var db3 = new sqlite3.Database('./piAltitude.db');

// Write a single TEMPERATURE record in JSON format to database table.
function insertTemp(data){
   // data is a javascript object   
   var statement = db1.prepare("INSERT INTO temperature_records VALUES (?, ?)");
   // Insert values into prepared statement
   statement.run(data.temperature_record[0].unix_time, data.temperature_record[0].fahrenheit);
   // Execute the statement
   statement.finalize();
}

// Write a single PRESSURE record in JSON format to database table.
function insertPressure(data){
   // data is a javascript object   
   var statement = db2.prepare("INSERT INTO pressure_records VALUES (?, ?)");
   // Insert values into prepared statement
   statement.run(data.pressure_record[0].unix_time, data.pressure_record[0].kPa);
   // Execute the statement
   statement.finalize();
}

// Write a single ALTITUDE record in JSON format to database table.
function insertAltitude(data){
   // data is a javascript object   
   var statement = db3.prepare("INSERT INTO altitude_records VALUES (?, ?)");
   // Insert values into prepared statement
   statement.run(data.altitude_record[0].unix_time, data.altitude_record[0].meters);
   // Execute the statement
   statement.finalize();
}

// Read current temperature from sensor
function readData(callback){
   fs.readFile('/home/pi/AThermSensor/data_BMP180', function(err, buffer)
	{
      if (err){
         console.error(err);
         process.exit(1);
      }

      // Read data from file (using fast node ASCII encoding).
      var data = buffer.toString('ascii').split("\n"); // Split by space
		
      // Extract temperature from string and divide by 1000 to give fahrenheit
      var temp  = parseFloat(data[0].split(" ")[1]);
      var pressure = parseFloat(data[1].split(" ")[1]);
      var altitude = parseFloat(data[2].split(" ")[1]);
      

      // Round to one decimal place
     //temp = Math.round10((temp*(9.0 / 5.0) + 32.0),-10);
	  temp = Number(((temp*(9.0 / 5.0) + 32.0)).toFixed(1)); //deg F (Fahrenheit)
	  pressure = Number((pressure/1000).toFixed(3)); 		 //kPa (kilo Pascals)
	  altitude = Number((altitude).toFixed(2));				 //m (meters)
	  //console.log(pressure);
	  //console.log(temp);
	  //console.log(altitude);
      //throw new Error("Stop");
      // Add date/time to temperature
   	var data = {
            temperature_record:[{
            unix_time: (Date.now() - 14400000),
            fahrenheit: temp
            }],
            pressure_record:[{
            unix_time: (Date.now() - 14400000),
            kPa: pressure
            }],
            altitude_record:[{
            unix_time: (Date.now() - 14400000),
            meters: altitude
            }]
            };

      // Execute call back with data
      callback(data);
   });
};

// Create a wrapper function which we'll use specifically for logging
function logTemp(interval){
      // Call the readData function with the insertTemp function as output to get initial reading
      readData(insertTemp);
      // Set the repeat interval (milliseconds). Third argument is passed as callback function to first (i.e. readData(insertTemp)).
      setInterval(readData, interval, insertTemp);
};

// Get temperature records from database
function selectTemp(num_records, start_date, callback){
   // - Num records is an SQL filter from latest record back trough time series, 
   // - start_date is the first date in the time-series required, 
   // - callback is the output function
   var current_temp = db.all("SELECT * FROM (SELECT * FROM temperature_records WHERE unix_time > (strftime('%s',?)*1000) ORDER BY unix_time DESC LIMIT ?) ORDER BY unix_time;", start_date, num_records,
      function(err, rows){
         if (err){
			   response.writeHead(500, { "Content-type": "text/html" });
			   response.end(err + "\n");
			   console.log('Error serving querying database. ' + err);
			   return;
				      }
         data = {temperature_record:[rows]}
         callback(data);
   });
};

// Setup node http server
var server = http.createServer(
	// Our main server function
	function(request, response)
	{
		// Grab the URL requested by the client and parse any query options
		var url = require('url').parse(request.url, true);
		var pathfile = url.pathname;
      var query = url.query;

		// Test to see if it's a database query
		if (pathfile == '/temperature_query.json'){
         // Test to see if number of observations was specified as url query
         if (query.num_obs){
            var num_obs = parseInt(query.num_obs);
         }
         else{
         // If not specified default to 20. Note use -1 in query string to get all.
            var num_obs = -1;
         }
         if (query.start_date){
            var start_date = query.start_date;
         }
         else{
            var start_date = '1970-01-01T00:00';
         }   
         // Send a message to console log
         console.log('Database query request from '+ request.connection.remoteAddress +' for ' + num_obs + ' records from ' + start_date+'.');
         // call selectTemp function to get data from database
         selectTemp(num_obs, start_date, function(data){
            response.writeHead(200, { "Content-type": "application/json" });		
	         response.end(JSON.stringify(data), "ascii");
         });
      return;
      }
      
      // Test to see if it's a request for current temperature   
      if (pathfile == '/temperature_now.json'){
            readData(function(data){
			      response.writeHead(200, { "Content-type": "application/json" });		
			      response.end(JSON.stringify(data), "ascii");
               });
      return;
      }
      
      // Handler for favicon.ico requests
		if (pathfile == '/favicon.ico'){
			response.writeHead(200, {'Content-Type': 'image/x-icon'});
			response.end();

			// Optionally log favicon requests.
			//console.log('favicon requested');
			return;
		}


		else {
			// Print requested file to terminal
			console.log('Request from '+ request.connection.remoteAddress +' for: ' + pathfile);

			// Serve file using node-static			
			staticServer.serve(request, response, function (err, result) {
					if (err){
						// Log the error
						sys.error("Error serving " + request.url + " - " + err.message);
						
						// Respond to the client
						response.writeHead(err.status, err.headers);
						response.end('Error 404 - file not found');
						return;
						}
					return;	
					})
		}
});

// Start temperature logging (every 5 min).
var msecs = (60 * 5) * 1000; // log interval duration in milliseconds
logTemp(msecs);
// Send a message to console
console.log('Server is logging to database at '+msecs+'ms intervals');
// Enable server
server.listen(8001);
// Log message
console.log('Server running at http://localhost:8001');
