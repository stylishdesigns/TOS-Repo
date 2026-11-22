import { Programme, Student } from '../types';

// Total tuition is read LIVE from the student's programme (the admin portal's
// settings), never from the copy stored on the student at enrolment, so a fee
// change in admin settings reaches every portal at once. The stored copy is
// only the fallback when the student's programme no longer exists, and a fee
// the admin set for this one student (feeOverride) always wins.
export const resolveStudentFee = (
  student: Partial<Student> | undefined | null,
  programmes: Programme[] = []
): number => {
  if (!student) return 0;
  if ((student as { feeOverride?: boolean }).feeOverride) return Number(student.totalFee || 0);
  const prog =
    programmes.find((p) => p.id === student.programmeId) ||
    programmes.find((p) => !student.programmeId && p.name === student.programmeName);
  const liveFee = prog ? Number(prog.fee || 0) : 0;
  return liveFee > 0 ? liveFee : Number(student.totalFee || 0);
};

// Balance due = the live fee minus what the student has actually paid.
export const resolveStudentBalance = (
  student: Partial<Student> | undefined | null,
  programmes: Programme[] = []
): { fee: number; paid: number; balance: number } => {
  const fee = resolveStudentFee(student, programmes);
  const paid = Number(student?.paidAmount || 0);
  return { fee, paid, balance: Math.max(0, fee - paid) };
};
