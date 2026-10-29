import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Lista de e-mails de professores autorizados a acessar o painel
const EMAILS_AUTORIZADOS = [
  'prof.eduardo.hernandes@gmail.com', 
]

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isRotaProfessor = request.nextUrl.pathname.startsWith('/professor')
  const isRotaLogin = request.nextUrl.pathname.startsWith('/professor/login')

  // Se tentar acessar o painel do professor sem estar logado ou com e-mail não autorizado
  if (isRotaProfessor && !isRotaLogin) {
    const userEmail = user?.email || ''
    const isAutorizado = userEmail !== '' && EMAILS_AUTORIZADOS.includes(userEmail)

    if (!user || !isAutorizado) {
      // Se estiver logado com e-mail não permitido, faz logout
      if (user && !isAutorizado) {
        await supabase.auth.signOut()
      }
      return NextResponse.redirect(new URL('/professor/login', request.url))
    }
  }

  // Se já estiver autenticado e tentar ir para /professor/login, redireciona para o painel
  if (isRotaLogin && user) {
    const userEmail = user.email || ''
    if (userEmail !== '' && EMAILS_AUTORIZADOS.includes(userEmail)) {
      return NextResponse.redirect(new URL('/professor', request.url))
    }
  }

  // Se já estiver autenticado e tentar ir para /professor/login, redireciona para o painel
  if (isRotaLogin && user && user.email && EMAILS_AUTORIZADOS.includes(user.email)) {
    return NextResponse.redirect(new URL('/professor', request.url))
  }

  return response
}

export const config = {
  matcher: ['/professor/:path*'],
}