import "./global.css";

export const metadata = {
  title: "Code Runner",
  description: "Run C++ snippets in the browser",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
