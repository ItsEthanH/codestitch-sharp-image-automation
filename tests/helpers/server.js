const http = require("http");
const fs = require("fs");
const path = require("path");

function startServer(fixturesDir) {
	return new Promise((resolve) => {
		const server = http.createServer((req, res) => {
			const filePath = path.join(fixturesDir, req.url.split("?")[0]);
			fs.readFile(filePath, "utf8", (err, data) => {
				if (err) {
					res.writeHead(404);
					res.end("Not Found");
					return;
				}
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(data);
			});
		});
		server.listen(0, () => resolve({ server, port: server.address().port }));
	});
}

function stopServer({ server }) {
	return new Promise((resolve) => server.close(resolve));
}

module.exports = { startServer, stopServer };
