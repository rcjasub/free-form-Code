const express = require('express');
const cors = require('cors');
const snippetRoutes = require('./routes/snippet');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/snippets', snippetRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
