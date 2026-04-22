import { io } from "socket.io-client";

const ADJECTIVES = ["Swift", "Lazy", "Brave", "Clever", "Sneaky", "Wild", "Tiny", "Cosmic", "Fuzzy", "Chill", "Speedy", "Bold", "Mystic", "Quiet", "Zesty"];
const ANIMALS = ["Fox", "Panda", "Otter", "Wolf", "Owl", "Bear", "Tiger", "Rabbit", "Deer", "Lynx", "Raven", "Hawk", "Seal", "Crow", "Frog"];

function randomGuestName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj}${animal}`;
}

export const guestName = randomGuestName();

const guestSocket = io(window.location.origin, {
  path: "/socket.io",
  withCredentials: true,
  auth: { guest: true, guestName },
});

export default guestSocket;
