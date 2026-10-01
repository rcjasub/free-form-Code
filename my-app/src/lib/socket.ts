import { io } from "socket.io-client"

// autoConnect: false — the server reads the auth cookie only once, at
// handshake time. Connecting on import meant the socket handshook on the
// login page (no cookie yet) and stayed a guest after login, so
// canvas:join was rejected until a full page refresh. The canvas page
// connects when it mounts instead, after the cookie exists.
const socket = io(window.location.origin, { path: "/socket.io", withCredentials: true, autoConnect: false })

export default socket