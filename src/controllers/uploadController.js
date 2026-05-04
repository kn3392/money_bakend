export async function postReceipt(req, res) {
  const f = req.file;
  if (!f?.filename) {
    return res.status(400).json({
      success: false,
      message: 'Receipt file required',
    });
  }
  const urlPath = `/uploads/receipts/${f.filename}`;
  return res.status(201).json({
    success: true,
    url: urlPath,
    originalName: f.originalname ?? '',
    mimetype: f.mimetype ?? '',
    size: f.size ?? 0,
  });
}
