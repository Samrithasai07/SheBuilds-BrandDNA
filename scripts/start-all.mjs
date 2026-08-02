import { spawn } from "node:child_process";

const port=process.env.PORT||"3040";
const children=[
  spawn("python",["-m","uvicorn","backend.main:app","--host","127.0.0.1","--port","8000"],{stdio:"inherit",shell:true}),
  spawn("npm",["run","start","--","-p",port],{stdio:"inherit",shell:true})
];

function stop(){for(const child of children)if(!child.killed)child.kill();process.exit()}
process.on("SIGINT",stop);process.on("SIGTERM",stop);
for(const child of children)child.on("exit",code=>{if(code&&code!==0)stop()});
