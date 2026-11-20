import express from 'express';
import User from '../models/User.js';
import { authenticate, requireAdmin } from '../lib/auth.js';

const router = express.Router();

router.get('/users', authenticate, requireAdmin, async (_req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ message: 'Could not load users.', detail: error.message });
  }
});

router.patch('/users/:id/approve', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'approved' },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    return res.json({ message: 'User approved.', user });
  } catch (error) {
    return res.status(500).json({ message: 'Could not approve user.', detail: error.message });
  }
});

router.patch('/users/:id/reject', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected' },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    return res.json({ message: 'User rejected.', user });
  } catch (error) {
    return res.status(500).json({ message: 'Could not reject user.', detail: error.message });
  }
});

router.delete('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    return res.json({ message: 'User removed.' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not remove user.', detail: error.message });
  }
});

export default router;
