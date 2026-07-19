import React, { useState } from 'react';
import './App.css';
import { buildSubmissionPayload, isValidEmail } from './form';

const submitEndpoint = import.meta.env.VITE_CRM_SEND_URL || '/send';

const fileToBase64 = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read image file.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Unable to read image file.'));
    };

    reader.readAsDataURL(file);
  });
};

function App() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    source: '',
    img: null as File | null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData((prev) => ({
        ...prev,
        img: e.target.files?.[0] || null,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.img) {
      alert('Please upload an image.');
      return;
    }

    if (!isValidEmail(formData.email)) {
      alert('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);

    try {
      const imageData = await fileToBase64(formData.img);
      const payload = buildSubmissionPayload({
        name: formData.name,
        email: formData.email,
        source: formData.source,
        img: imageData,
      });

      const response = await fetch(submitEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        alert('Form submitted successfully!');
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('An error occurred while submitting the form.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="App">
      <form className="book-form" onSubmit={handleSubmit} aria-labelledby="book-form-title">
        <h1 className="book-form__title" id="book-form-title">Send us your details</h1>
        <p className="book-form__description">Complete the form and include an image to get started.</p>
        <div className="book-form__field">
          <label htmlFor="name">Name</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>
        <div className="book-form__field">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>
        <div className="book-form__field">
          <label htmlFor="source">Source</label>
          <input
            type="text"
            id="source"
            name="source"
            value={formData.source}
            onChange={handleChange}
            required
          />
        </div>
        <div className="book-form__field">
          <label htmlFor="img">Image</label>
          <input
            type="file"
            id="img"
            name="img"
            accept="image/*"
            onChange={handleFileChange}
            required
          />
        </div>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
      </form>
    </main>
  );
}

export default App;
