import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = 3000;

const server = createServer((request, response) => {
    console.log(
        `${request.method} ${request.url}`
    );

    if(
        request.method === "GET" && 
        request.url === "/health"
    ) {
        response.writeHead(200, {
            "Content-Type": "application/json"
        });

        response.end(
            JSON.stringify({
                status: "ok"
            })
        );

        return;
    }

    response.writeHead(404, {
        "Content-Type": "application/json"
    })

    response.end(
        JSON.stringify({
            error: "Not found"
        })
    )
})

server.listen(PORT, HOST, () => {
    console.log(
        `Server running at http://${HOST}:${PORT}`
    )
})