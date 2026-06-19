variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "nexus-comms"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT Secret"
  type        = string
  sensitive   = true
}

variable "turn_credential" {
  description = "TURN server credential"
  type        = string
  sensitive   = true
}

variable "domain_name" {
  description = "Domain name for the application (e.g., example.com)"
  type        = string
  default     = ""
}
