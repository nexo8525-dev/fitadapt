const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!user) return;

  setLoading(true);
  try {
    const response = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData), // Direct formData bhejo, parsing server pe ho jayegi
    });

    const result = await response.json();

    if (response.ok) {
      router.push('/dashboard');
    } else {
      alert(result.error || 'Something went wrong. Please try again.');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Network error. Please try again.');
  } finally {
    setLoading(false);
  }
};
