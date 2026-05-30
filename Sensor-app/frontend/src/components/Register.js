import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

const Register = () => {
    const [id, setId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!id || !password) {
            setError('Please enter both ID and password.');
            return;
        }
        try {
            const response = await axios.post('http://localhost:5000/register', { id, password });
            if (response.data.success) {
                navigate('/login');
            }
        } catch (error) {
            setError('An error occurred. Please try again.');
            console.error('Registration failed', error);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h2 className="auth-title">Create an Account</h2>
                    <p className="auth-subtitle">Join us to get started.</p>
                </div>
                <form onSubmit={handleRegister} className="auth-form">
                    <div className="form-group">
                        <label className="form-label">ID</label>
                        <input
                            type="text"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            className="form-control"
                            placeholder="Enter your ID"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="form-control"
                            placeholder="Enter your password"
                            required
                        />
                    </div>
                    {error && <div className="alert alert-danger">{error}</div>}
                    <button type="submit" className="btn btn-primary btn-block">
                        REGISTER
                    </button>
                </form>
                <div className="auth-footer">
                    <p className="text-center">
                        Already have an account?{' '}
                        <button onClick={() => navigate('/login')} className="btn btn-link">
                            Login
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Register;