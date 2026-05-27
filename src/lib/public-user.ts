export function toPublicUser(user: {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  avatarUrl: string | null;
  currentPhotoId: string | null;
  avatarFocusX: number;
  avatarFocusY: number;
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl,
    currentPhotoId: user.currentPhotoId,
    avatarFocusX: user.avatarFocusX,
    avatarFocusY: user.avatarFocusY,
  };
}
