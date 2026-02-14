const mongoose = require('mongoose');
const Package = require('../src/models/Package');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/registersystem', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to DB');
  
  const defaultPackage = {
    name: 'Standard Support Package',
    description: 'แพ็กเกจสนับสนุนมาตรฐาน ได้รับเสื้อและของที่ระลึก',
    price: 500,
    items: [{
      itemName: 'เสื้อกิจกรรม',
      sizes: [
        { size: 'S', stock: 100, sold: 0 },
        { size: 'M', stock: 150, sold: 0 },
        { size: 'L', stock: 150, sold: 0 },
        { size: 'XL', stock: 100, sold: 0 }
      ]
    }],
    orderDeadline: new Date('2026-12-31T23:59:59'),
    pickupLocations: ['จุดลงทะเบียนหน้างาน A', 'จุดรับของ B'],
    isDeliveryAvailable: true,
    isActive: true
  };

  await Package.create(defaultPackage);
  console.log('Migration Completed: Default Package inserted.');
  process.exit(0);
}).catch(err => {
  console.error('Migration Error:', err);
  process.exit(1);
});