const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken"); // Import JWT
require("dotenv").config();

const app = express();
const PORT = process.env.PORT;

// Secret key untuk JWT (sebaiknya disimpan di environment variable)
const JWT_SECRET = process.env.JWT_SECRET;
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(",");

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(cors(corsOptions));
app.use(express.json());

// Konfigurasi Multer untuk upload gambar
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Pastikan folder "uploads" dan "data" ada
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}
if (!fs.existsSync("data")) {
  fs.mkdirSync("data");
}

const dataFilePath = "./data/games.json";

// Fungsi untuk memuat dan menyimpan data game
function loadGameData() {
  if (fs.existsSync(dataFilePath)) {
    try {
      const data = fs.readFileSync(dataFilePath, "utf8");
      return JSON.parse(data);
    } catch (err) {
      console.error("Error reading game data file:", err);
      return [];
    }
  }
  return [];
}
function saveGameData() {
  fs.writeFileSync(dataFilePath, JSON.stringify(gameData, null, 2));
}

let gameData = loadGameData();
if (gameData.length === 0) {
  gameData = [{ id: 1, name: "Masukkan Data", spins: "Masukkan Data", spins2: "Masukkan Data", spins3: "Masukkan Data", image: "Masukkan Data" }];
  saveGameData();
}

// ---------------------
// 1.1. Tambahkan endpoint login
// ---------------------
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  // Validasi kredensial (contoh: hardcoded)
  if (username === process.env.USERNAME_LOGIN && password === process.env.PASSWORD_LOGIN) {
    // Jika valid, buat token JWT
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "1h" });

    return res.json({ message: "Login successful", token });
  }
  res.status(401).json({ message: "Username atau password salah !" });
});

// ---------------------
// 1.2. Middleware untuk autentikasi
// ---------------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Terjadi kesalahan, coba beberapa saat lagi." }); //No token provided

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Terjadi masalah saat memverifikasi permintaan Anda, silakan coba lagi." }); //Invalid token
    req.user = user;
    next();
  });
}

// ---------------------
// Endpoint public (misalnya, mendapatkan daftar games)
// ---------------------
app.get("/api/games", (req, res) => {
  res.json(gameData);
});

// ---------------------
// Endpoint untuk update, tambah, hapus game & link (endpoint admin)
// Tambahkan middleware authenticateToken pada endpoint yang membutuhkan proteksi
// ---------------------

app.post("/api/games", upload.single("image"), authenticateToken, (req, res) => {
  const { id, name, spins, spins2, spins3 } = req.body;
  const updatedGame = { id: parseInt(id), name, spins, spins2, spins3 };

  if (req.file) {
    updatedGame.image = req.file.path;
  } else {
    const existingGame = gameData.find((game) => game.id === parseInt(id));
    if (existingGame) {
      updatedGame.image = existingGame.image;
    }
  }

  const gameIndex = gameData.findIndex((game) => game.id === parseInt(id));
  if (gameIndex !== -1) {
    if (req.file && gameData[gameIndex].image && fs.existsSync(gameData[gameIndex].image)) {
      fs.unlinkSync(gameData[gameIndex].image);
    }
    gameData[gameIndex] = updatedGame;
  } else {
    gameData.push(updatedGame);
  }

  saveGameData();
  res.json({ message: "Data berhasil diperbarui!" });
});

app.post("/api/games/add", upload.single("image"), authenticateToken, (req, res) => {
  const { id, name, spins, spins2, spins3 } = req.body;

  if (gameData.some((game) => game.id === parseInt(id))) {
    return res.status(400).json({ message: `ID ${game.id} ini sudah ada.` });
  }

  const newGame = {
    id: parseInt(id),
    name,
    spins,
    spins2,
    spins3,
    image: req.file ? req.file.path : null,
  };

  gameData.push(newGame);
  saveGameData();

  res.json({ message: "Berhasil ditambahkan!" });
});

app.delete("/api/games/:id", authenticateToken, (req, res) => {
  const { id } = req.params;

  const gameIndex = gameData.findIndex((game) => game.id === parseInt(id));
  if (gameIndex !== -1) {
    const imagePath = gameData[gameIndex].image;
    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    gameData.splice(gameIndex, 1);
    saveGameData();
    res.json({ message: "Berhasil dihapus!" });
  } else {
    res.status(404).json({ message: "Tidak ditemukan dalam databse" });
  }
});

app.get("/api/admin/images", authenticateToken, (req, res) => {
  const imageFiles = fs.readdirSync("uploads/");
  const imageDetails = imageFiles.map((file) => {
    const stats = fs.statSync(path.join("uploads/", file));
    return {
      fileName: file,
      size: stats.size,
      lastModified: stats.mtime,
    };
  });
  res.json(imageDetails);
});

app.delete("/api/admin/images/:fileName", authenticateToken, (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join("uploads/", fileName);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    gameData.forEach((game) => {
      if (game.image && game.image.includes(fileName)) {
        game.image = null;
      }
    });
    saveGameData();
    res.json({ message: "Foto berhasil dihapus!" });
  } else {
    res.status(404).json({ message: "Foto tidak ditemukan" });
  }
});

app.get("/api/admin/games/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const game = gameData.find((g) => g.id === parseInt(id));
  if (game) {
    res.json(game);
  } else {
    res.status(404).json({ message: "Tidak ditemukan dalam databse" });
  }
});

app.put("/api/admin/games/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, spins, spins2, spins3, image } = req.body;

  const gameIndex = gameData.findIndex((g) => g.id === parseInt(id));
  if (gameIndex !== -1) {
    const updatedGame = { id: parseInt(id), name, spins, spins2, spins3, image };
    gameData[gameIndex] = updatedGame;
    saveGameData();
    res.json({ message: "Berhasil di update!" });
  } else {
    res.status(404).json({ message: "Tidak ditemukan dalam databse" });
  }
});

// Endpoint untuk link
const linkFilePath = "./data/link.json";
function loadLinkData() {
  if (fs.existsSync(linkFilePath)) {
    try {
      const data = fs.readFileSync(linkFilePath, "utf8");
      return JSON.parse(data);
    } catch (err) {
      console.error("Error reading link data file:", err);
      return { link: "" };
    }
  }
  return { link: "" };
}
function saveLinkData(linkData) {
  fs.writeFileSync(linkFilePath, JSON.stringify(linkData, null, 2));
}
let linkData = loadLinkData();

app.get("/api/link", (req, res) => {
  res.json(linkData);
});
app.put("/api/link", authenticateToken, (req, res) => {
  const { link } = req.body;
  linkData.link = link;
  saveLinkData(linkData);
  res.json({ message: "Berhasil Update Link!", link: linkData.link });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
