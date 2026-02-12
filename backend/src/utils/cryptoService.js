const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// เก็บ Key ไว้ที่ root ของ backend (นอก src)
const privateKeyPath = path.join(__dirname, '../../private.pem');
const publicKeyPath = path.join(__dirname, '../../public.pem');

let privateKey;
let publicKey;

// ฟังก์ชันสร้าง Key อัตโนมัติเมื่อเริ่ม Server
const initKeys = () => {
    if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
        console.log("Generating new RSA Key Pair...");
        const { privateKey: priv, publicKey: pub } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        fs.writeFileSync(privateKeyPath, priv);
        fs.writeFileSync(publicKeyPath, pub);
        privateKey = priv;
        publicKey = pub;
        console.log("RSA Keys Generated successfully.");
    } else {
        privateKey = fs.readFileSync(privateKeyPath, 'utf8');
        publicKey = fs.readFileSync(publicKeyPath, 'utf8');
        console.log("RSA Keys Loaded.");
    }
};

// เรียกใช้งานทันทีที่ import
initKeys();

exports.getPublicKey = () => publicKey;

exports.decryptData = (encryptedData) => {
    try {
        if (!encryptedData) return null;
        const buffer = Buffer.from(encryptedData, 'base64');
        const decrypted = crypto.privateDecrypt(
            {
                key: privateKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: "sha256",
            },
            buffer
        );
        return decrypted.toString('utf8');
    } catch (err) {
        console.error("Decryption failed:", err.message);
        return null; 
    }
};