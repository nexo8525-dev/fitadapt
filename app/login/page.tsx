import { SignIn } from '@clerk/nextjs';
import { Dumbbell } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center px-6 py-12">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-emerald-500 p-3 rounded-2xl text-slate-950 shadow-lg shadow-emerald-500/20">
            <Dumbbell className="w-8 h-8 font-bold" />
          </div>
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-100 mb-2">
          FitAdapt AI
        </h2>
        <p className="text-sm text-slate-400 mb-8">
          Secure authentication powered by Clerk
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md flex justify-center">
        {/* Clerk ka Pre-built Drop-in UI */}
        <SignIn 
          routing="hash" 
          fallbackRedirectUrl="/dashboard" 
          signUpFallbackRedirectUrl="/onboarding"
          appearance={{
            elements: {
              formButtonPrimary: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold',
              card: 'bg-slate-900 border border-slate-800 shadow-xl',
              headerTitle: 'text-slate-100',
              headerSubtitle: 'text-slate-400',
              socialButtonsBlockButton: 'text-slate-300 border-slate-700 hover:bg-slate-800',
              dividerLine: 'bg-slate-800',
              dividerText: 'text-slate-500',
              formFieldLabel: 'text-slate-300',
              formFieldInput: 'bg-slate-950 border-slate-800 text-slate-100',
              footerActionText: 'text-slate-400',
              footerActionLink: 'text-emerald-400 hover:text-emerald-300',
            }
          }}
        />
      </div>
    </div>
  );
}
