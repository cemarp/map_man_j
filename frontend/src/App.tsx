import { useState, useEffect } from 'react'
import ClassicApp from './ClassicApp'
import NewApp from './NewApp'

export default function App() {
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    const handleHashChange = () => {
      setHash(window.location.hash)
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  if (hash === '#/new') {
    return <NewApp />
  }

  return <ClassicApp />
}
