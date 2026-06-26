const Prize = require('../models/prize');
const Participant = require('../models/participant');

exports.listPrizes = async (req, res) => {
  try {
    const prizes = await Prize.find().populate('winners.participantId', 'fields.name registeredPoint').sort({ createdAt: -1 });
    res.json(prizes);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.listPublicPrizes = async (req, res) => {
  try {
    const prizes = await Prize.find()
      .populate('winners.participantId', 'fields.name fields.dept fields.department registeredPoint')
      .sort({ createdAt: -1 })
      .lean();

    const maskName = (name = '') => {
      const cleanName = String(name).trim();
      if (!cleanName) return 'ไม่ทราบชื่อ';
      return cleanName.length <= 3 ? `${cleanName[0]}***` : `${cleanName.slice(0, 3)}***`;
    };

    const safePrizes = prizes.map((prize) => ({
      _id: prize._id,
      name: prize.name,
      totalQuantity: prize.totalQuantity,
      remainingQuantity: prize.remainingQuantity,
      winners: (prize.winners || []).map((winner) => ({
        wonAt: winner.wonAt,
        participantName: maskName(winner.participantId?.fields?.name),
        department: winner.participantId?.fields?.department || winner.participantId?.fields?.dept || ''
      }))
    }));

    res.json(safePrizes);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createPrize = async (req, res) => {
  try {
    const prize = await Prize.create(req.body);
    res.json(prize);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.deletePrize = async (req, res) => {
  try {
    await Prize.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

// สุ่มผู้โชคดี (Lucky Draw)
exports.drawPrize = async (req, res) => {
  try {
    const { prizeId } = req.params;
    const prize = await Prize.findById(prizeId);
    if (!prize) return res.status(404).json({ error: 'ไม่พบของรางวัล' });
    if (prize.remainingQuantity <= 0) return res.status(400).json({ error: 'ของรางวัลหมดแล้ว' });

    // ดึงคนที่ชนะไปแล้วออกมาทั้งหมด (กันได้ซ้ำ)
    const allPrizes = await Prize.find();
    let wonIds = [];
    allPrizes.forEach(p => {
        p.winners.forEach(w => wonIds.push(w.participantId));
    });

    // 🌟 สุ่มคน Check-in ที่ยังไม่ได้รางวัล และ "ไม่เคยสละสิทธิ์"
    const randomWinner = await Participant.aggregate([
      { $match: { status: 'checkedIn', isDeleted: false, isForfeited: { $ne: true }, _id: { $nin: wonIds } } },
      { $sample: { size: 1 } }
    ]);

    if (!randomWinner || randomWinner.length === 0) {
      return res.status(400).json({ error: 'ไม่พบผู้ที่มีสิทธิ์รับรางวัล (หรือทุกคนได้รางวัลไปหมดแล้ว)' });
    }

    const winnerId = randomWinner[0]._id;
    prize.remainingQuantity -= 1;
    prize.winners.push({ participantId: winnerId });
    await prize.save();

   res.json({
        message: 'Draw success',
        winner: { 
            _id: randomWinner[0]._id, // 🌟 เพิ่ม _id ส่งกลับไปให้ Frontend เอาไว้อ้างอิงตอนสละสิทธิ์
            name: randomWinner[0].fields.name, 
            department: randomWinner[0].fields.department || '' 
        },
        prize
    });
  } catch (err) { res.status(500).json({ error: 'Server error', detail: err.message }); }
};

exports.cancelWinner = async (req, res) => {
  try {
    const { prizeId, winnerId } = req.body;
    
    if (!prizeId || !winnerId) {
      return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
    }

    const prize = await Prize.findById(prizeId);
    if (!prize) return res.status(404).json({ error: 'ไม่พบของรางวัล' });

    // 1. จำจำนวนผู้ชนะก่อนลบไว้
    const originalLength = prize.winners.length;

    // 2. กรองชื่อผู้ที่สละสิทธิ์ออก
    prize.winners = prize.winners.filter(
      w => w.participantId.toString() !== winnerId.toString()
    );

    // 3. ตรวจสอบว่ามีรายชื่อถูกลบออกไป "จริงหรือไม่" 
    if (prize.winners.length < originalLength) {
      // คำนวณจำนวนคนที่ลบออก (เผื่อกรณีรายชื่อซ้ำกัน)
      const removedCount = originalLength - prize.winners.length;
      
      // บวกโควต้าคืนตามจำนวนที่ลบออก
      prize.remainingQuantity += removedCount;

      // 4. ป้องกันจำนวนของรางวัลคงเหลือ เกินจำนวนรางวัลทั้งหมด (Total) ป้องกันการเบิ้ล
      if (prize.remainingQuantity > prize.totalQuantity) {
        prize.remainingQuantity = prize.totalQuantity;
      }

      await prize.save();

      // 🌟 5. อัปเดตข้อมูล Participant ว่าคนนี้ "สละสิทธิ์" (Blacklist) ไปแล้ว
      await Participant.findByIdAndUpdate(winnerId, { isForfeited: true });

      return res.json({ message: "ยกเลิกสิทธิ์สำเร็จ โควต้าถูกคืนแล้ว", prize });
      
    } else {
      // กรณีเผลอกดเบิ้ล หรือไม่มีชื่อนี้แล้ว จะตกมาที่นี่ และไม่โดนบวกโควต้าเพิ่มมั่วๆ ครับ
      return res.status(400).json({ error: "ไม่พบรายชื่อผู้ชนะท่านนี้ (อาจถูกยกเลิกไปแล้ว)" });
    }

  } catch (err) {
    res.status(500).json({ error: "ไม่สามารถยกเลิกสิทธิ์ได้", detail: err.message });
  }
};
