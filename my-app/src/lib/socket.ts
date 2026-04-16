import { io } from "socket.io-client"

const socket = io(window.location.origin, { path: "/socket.io" })

export default socket