import {
  listRecurring,
  createRecurring,
  updateRecurring,
  deleteRecurringSoft,
  runDueRecurringTransactions,
} from '../services/recurringService.js';

function toPublic(r) {
  const o =
    typeof r.toObject === 'function' ? r.toObject({ virtuals: false }) : r;
  return {
    id: o._id?.toString(),
    type: o.type,
    amount: o.amount,
    accountId: o.accountId?.toString?.() ?? o.accountId,
    categoryId: o.categoryId?.toString?.() ?? o.categoryId,
    fromAccountId: o.fromAccountId?.toString?.() ?? o.fromAccountId,
    toAccountId: o.toAccountId?.toString?.() ?? o.toAccountId,
    personId: o.personId?.toString?.() ?? o.personId,
    frequency: o.frequency,
    startDate: o.startDate,
    nextRunDate: o.nextRunDate,
    endDate: o.endDate,
    isActive: o.isActive,
    note: o.note ?? '',
    lastMaterializedDateKey: o.lastMaterializedDateKey,
    lastRunDate: o.lastRunDate,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export async function listRecurringCtr(req, res) {
  const rows = await listRecurring(req.user._id.toString());
  res.json({ success: true, recurring: rows.map(toPublic) });
}

export async function postRecurringCtr(req, res) {
  stripServerFields(req.body);
  const doc = await createRecurring(req.user._id.toString(), req.body);
  res.status(201).json({ success: true, recurring: toPublic(doc) });
}

export async function putRecurringCtr(req, res) {
  stripServerFields(req.body);
  delete req.body.userId;
  const doc = await updateRecurring(
    req.user._id.toString(),
    req.params.id,
    req.body
  );
  res.json({ success: true, recurring: toPublic(doc) });
}

export async function deleteRecurringCtr(req, res) {
  const doc = await deleteRecurringSoft(req.user._id.toString(), req.params.id);
  res.json({
    success: true,
    message: 'Recurring rule disabled',
    recurring: toPublic(doc),
  });
}

export async function runDueCtr(req, res) {
  await runDueRecurringTransactions(req.user._id.toString());
  res.json({
    success: true,
    message: 'Queued recurring postings processed where due',
  });
}

/** Never trust inbound user linkage. */
function stripServerFields(body) {
  if (!body || typeof body !== 'object') return;
  delete body.userId;
}
