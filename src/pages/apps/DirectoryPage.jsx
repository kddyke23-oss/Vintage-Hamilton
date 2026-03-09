import { useAuth } from '@/context/AuthContext'
import ResidentDirectory from '@/pages/ResidentDirectory'

export default function DirectoryPage() {
  const { user, isAdmin, isAppAdmin } = useAuth()

  return (
    <ResidentDirectory
      user={user}
      isAdmin={isAdmin}
      isDirectoryAdmin={isAppAdmin('directory')}
    />
  )
}
