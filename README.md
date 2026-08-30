# 🩺 MediCare Connect — Server

### Healthcare Appointment & Management System

MediCare Connect is a secure REST API for a healthcare platform that connects patients with doctors. It handles appointments, schedules, prescriptions, reviews, payments, authentication, and admin management.

## 🚀 Tech Stack

* Node.js
* Express.js
* MongoDB
* JWT
* Stripe
* Better Auth
* CORS
* dotenv

## ✨ Features

### 👤 Patient

* Doctor search & filtering
* Book appointments
* Stripe payments
* Manage appointments
* Reviews & ratings
* Favorite doctors
* View prescriptions
* Payment history

### 👨‍⚕️ Doctor

* Manage profile
* Manage schedules
* Accept/reject appointments
* Complete appointments
* Manage prescriptions
* View reviews & statistics

### 👨‍💼 Admin

* Manage users
* Verify/reject doctors
* Manage appointments
* Monitor payments
* Platform analytics

## 🔐 Authentication

The API uses JWT authentication and role-based authorization.

```text
Request
   ↓
JWT Verification
   ↓
User Identification
   ↓
Role Verification
   ↓
Protected API
```

Roles:

```text
Patient | Doctor | Admin
```

## 🗄️ Database

MongoDB collections:

```text
users
doctors
schedules
appointments
payments
reviews
prescriptions
favorites
notifications
```

## 🔗 Main API Routes

```text
GET/POST/PATCH/DELETE  /users
GET/POST/PATCH         /doctors
GET/POST/PATCH/DELETE  /schedules
GET/POST/PATCH         /appointments
GET/POST/PATCH/DELETE  /reviews
GET/POST/PATCH         /prescriptions
GET/POST               /payments
GET/POST/DELETE        /favorites
```

Private routes require:

```http
Authorization: Bearer <JWT_TOKEN>
```

## 💳 Payment Flow

```text
Appointment
     ↓
Stripe Checkout
     ↓
Payment Success
     ↓
Save Payment
     ↓
Confirm Appointment
```

## 👨‍💻 Developer

**Shihab Shahriar**

Computer Science & Engineering Student
