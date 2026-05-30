import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

const Login = () => {
    const [id, setId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!id || !password) {
            setError('Please enter both ID and password.');
            return;
        }
        try {
            const response = await axios.post(`${process.env.REACT_APP_API_URL}/login`, { id, password });
            if (response.data.success) {
                localStorage.setItem('userId', id); // Store user ID in localStorage
                navigate('/dashboard'); // Redirect to the dashboard
            } else {
                setError('Invalid ID or password');
            }
        } catch (error) {
            setError('An error occurred. Please try again.');
            console.error('Login failed', error);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h2 className="auth-title">Welcome Back!</h2>
                    <p className="auth-subtitle">Please log in to access your dashboard.</p>
                </div>
                <form onSubmit={handleLogin} className="auth-form">
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
                        LOGIN
                    </button>
                </form>
                <div className="auth-footer">
                    <p className="text-center">
                        Don't have an account?{' '}
                        <button onClick={() => navigate('/register')} className="btn btn-link">
                            Register
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;