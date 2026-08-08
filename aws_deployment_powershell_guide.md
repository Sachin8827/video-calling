# AWS Free Tier Deployment Guide (PowerShell)

Yeh file aapke AWS deployment ki ek complete summary hai, jisme ab tak execute kiye gaye saare PowerShell commands aur unka Hinglish mein explanation diya gaya hai. Isse aap future mein kabhi bhi refer kar sakte hain.

---

## Step 1: AWS CLI Configuration

```powershell
aws configure
```
*   **Purpose:** Aapke computer/terminal ko AWS account se link karna.
*   **Why we use it:** Taaki hum commands ke through AWS ko control kar sakein bina website khole. Ise chalane par humne Access Key, Secret Key, aur default region (`ap-south-1`) set kiya tha.

---

## Step 2: VPC & Networking (Apna Private Network Banana)

```powershell
# 1. Create VPC (Ghar ki chaardiwari)
$VPC_ID = aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=nexus-vpc}]' --query 'Vpc.VpcId' --output text

# Enable DNS (Servers ko friendly naam dene ke liye)
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-support
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames

# 2. Create Subnets (Ghar ke andar ke kamre)
$PUBLIC_A = aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 --availability-zone ap-south-1a --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=nexus-public-a}]' --query 'Subnet.SubnetId' --output text
$PUBLIC_B = aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.2.0/24 --availability-zone ap-south-1b --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=nexus-public-b}]' --query 'Subnet.SubnetId' --output text
$PRIVATE_A = aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.3.0/24 --availability-zone ap-south-1a --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=nexus-private-a}]' --query 'Subnet.SubnetId' --output text

# Enable auto-assign public IP (Public kamro mein internet connection)
aws ec2 modify-subnet-attribute --subnet-id $PUBLIC_A --map-public-ip-on-launch
aws ec2 modify-subnet-attribute --subnet-id $PUBLIC_B --map-public-ip-on-launch

# 3. Internet Gateway (Ghar ka main darwaza)
$IGW_ID = aws ec2 create-internet-gateway --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=nexus-igw}]' --query 'InternetGateway.InternetGatewayId' --output text
aws ec2 attach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID

# 4. Route Table (Darwaze ka rasta dikhane wala sign-board)
$RT_ID = aws ec2 create-route-table --vpc-id $VPC_ID --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=nexus-public-rt}]' --query 'RouteTable.RouteTableId' --output text
aws ec2 create-route --route-table-id $RT_ID --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID
aws ec2 associate-route-table --route-table-id $RT_ID --subnet-id $PUBLIC_A
aws ec2 associate-route-table --route-table-id $RT_ID --subnet-id $PUBLIC_B
```

*   **Purpose:** Ek secure private network setup karna.
*   **Why we use it:** Bina network ke koi server ya database AWS mein nahi ban sakta. Humne Public subnets banaye Load Balancer ke liye (internet connectivity ke sath), aur ek Private subnet banaya Database ke liye (jahan internet nahi ja sakta) taaki security bani rahe.

---

## Step 3: Security Groups (Firewall / Bouncers)

```powershell
# 1. ALB Security Group (Front Door Bouncer)
$ALB_SG = aws ec2 create-security-group --group-name nexus-alb-sg --description "ALB public access" --vpc-id $VPC_ID --query 'GroupId' --output text
aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 443 --cidr 0.0.0.0/0

# 2. ECS/EC2 Security Group (Server Bouncer)
$ECS_SG = aws ec2 create-security-group --group-name nexus-ecs-sg --description "ECS tasks from ALB" --vpc-id $VPC_ID --query 'GroupId' --output text
aws ec2 authorize-security-group-ingress --group-id $ECS_SG --protocol tcp --port 3000 --source-group $ALB_SG

# 3. RDS Security Group (Database Bouncer)
$RDS_SG = aws ec2 create-security-group --group-name nexus-rds-sg --description "RDS from ECS only" --vpc-id $VPC_ID --query 'GroupId' --output text
aws ec2 authorize-security-group-ingress --group-id $RDS_SG --protocol tcp --port 5432 --source-group $ECS_SG
```

*   **Purpose:** Har layer par strict traffic rules lagana.
*   **Why we use it:** Hum internet traffic (0.0.0.0/0) ko sirf Load Balancer tak limit karte hain. Server sirf Load Balancer se baat karega, aur Database sirf Server se baat karega. Yeh ek hack-proof chain banata hai. `--vpc-id` flag se AWS ko pata chalta hai ki in firewalls ko kis network ke andar active karna hai.

---

## Step 4: Database Setup (RDS PostgreSQL - Free Tier)

```powershell
# 1. Create DB Subnet Group (AWS ko batana ki DB kahan rakhna hai)
aws rds create-db-subnet-group --db-subnet-group-name nexus-db-subnet --db-subnet-group-description "Subnets for RDS" --subnet-ids $PRIVATE_A $PUBLIC_B

# 2. Create Database (Actual Server start karna)
aws rds create-db-instance --db-instance-identifier nexus-db --db-instance-class db.t4g.micro --engine postgres --master-username postgres --master-user-password YourStrongPassword123 --allocated-storage 20 --vpc-security-group-ids $RDS_SG --db-subnet-group-name nexus-db-subnet --no-publicly-accessible --no-multi-az
```

*   **Purpose:** AWS Managed PostgreSQL Database start karna.
*   **Why we use it:** Khud EC2 par DB manage karne ke bajaye RDS use karna asaan hai.
*   **Key Flags (Paise bachane ke liye):** `--db-instance-class db.t4g.micro` (free tier machine), `--allocated-storage 20` (free tier disk space), aur `--no-multi-az` (dusra backup server na banane dena jiska $25 bill aata hai).

---

## Step 5: Elastic Container Registry (ECR)

```powershell
# Create ECR Repository for Backend
aws ecr create-repository --repository-name nexus-backend --region ap-south-1

# Attach Lifecycle Policy (Keep only last 5 images to save storage)
@'
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 5 images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 5
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
'@ | Out-File -FilePath ecr-lifecycle.json -Encoding ascii
aws ecr put-lifecycle-policy --repository-name nexus-backend --lifecycle-policy-text file://ecr-lifecycle.json --region ap-south-1
Remove-Item ecr-lifecycle.json
```

*   **Purpose:** AWS mein ek private "Locker" (Docker Hub jaisa) banana.
*   **Why we use it:** Hum apne Node.js/NestJS code ko ek Docker container mein pack karke is locker mein push karenge, taaki ECS server baad mein wahan se code utha kar run kar sake. (Frontend S3 par hai, toh uske liye locker nahi banaya).

---

## Step 6: IAM Roles (Permissions)

```powershell
# 1. Policy file banana
@'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
'@ | Out-File -FilePath trust-policy.json -Encoding utf8

# 2. Role create karna
aws iam create-role --role-name ecsTaskExecutionRole --assume-role-policy-document file://trust-policy.json

# 3. Role ko official AWS permissions dena
aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# 4. Cleanup
Remove-Item trust-policy.json
```

*   **Purpose:** ECS Server ke liye ek "ID Card" banana.
*   **Why we use it:** AWS mein koi bhi service bina permission ke dusri service se baat nahi kar sakti. Yeh ID card (Role) ECS server ko allow karega ki wo ECR (Locker) se Docker images securely download kar sake aur CloudWatch mein logs save kar sake.

---

## Step 7: Application Load Balancer (ALB)

```powershell
# 1. Create the Load Balancer (Traffic Police)
$ALB_ARN = aws elbv2 create-load-balancer --name nexus-alb --subnets $PUBLIC_A $PUBLIC_B --security-groups $ALB_SG --query 'LoadBalancers[0].LoadBalancerArn' --output text

# 2. Create Target Group (Backend Servers list with Health Checks)
$TG_ARN = aws elbv2 create-target-group --name nexus-tg --protocol HTTP --port 3000 --vpc-id $VPC_ID --target-type ip --health-check-protocol HTTP --health-check-port 3000 --health-check-path /health --health-check-interval-seconds 30 --healthy-threshold-count 2 --query 'TargetGroups[0].TargetGroupArn' --output text

# 3. Create ALB Listener (Port 80 par traffic sunna)
aws elbv2 create-listener --load-balancer-arn $ALB_ARN --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=$TG_ARN
```

*   **Purpose:** Ek "Traffic Police" setup karna jo internet traffic ko barabar servers mein baant sake.
*   **Why we use it:** Jaise-jaise aapke users badhenge, ek akela server saara load nahi utha payega. Load Balancer aane wale sabhi Port 80 (HTTP) requests ko receive karta hai, aur unhe Target Group ke andar Port 3000 par chal rahe actual Node.js servers tak securely forward kar deta hai. Saath hi, yeh dono public subnets (`$PUBLIC_A`, `$PUBLIC_B`) mein maujood hota hai taaki ek data center fail hone par bhi website band na ho.

---

## Step 8: Docker Image Build & Push to ECR

```powershell
# 1. Get AWS Account ID
$ACCOUNT_ID = aws sts get-caller-identity --query Account --output text

# 2. Login Docker to AWS ECR
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com"

# 3. Build Docker Image (Multi-stage build)
docker build -t nexus-backend .

# 4. Tag Docker Image
docker tag nexus-backend:latest "$ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/nexus-backend:latest"

# 5. Push Docker Image to ECR
docker push "$ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/nexus-backend:latest"
```

*   **Purpose:** Local NestJS/MediaSoup backend ko Docker container mein build karke AWS ECR locker mein save karna.
*   **Why we use it:** Multi-stage build se image size 2.11 GB se ghat kar sirf 642 MB reh gayi, jisse deployment fast aur production-ready ho gaya.

---

## Step 9: ECS Deployment (Cluster, Sidecar Redis, Task Definition & Service Launch)

```powershell
# 1. Create ECS Cluster (Containers ka playground)
aws ecs create-cluster --cluster-name nexus-cluster --region ap-south-1

# 2. Create CloudWatch Log Group (Live server logs dekhne ke liye)
aws logs create-log-group --log-group-name /ecs/nexus-backend --region ap-south-1

# 3. Register Task Definition in AWS (Clean JSON format)
aws ecs register-task-definition --cli-input-json file://task-definition.json --region ap-south-1

# 4. Fetch Dynamic IDs & Launch ECS Service on Fargate
$VPC_ID = (aws ec2 describe-vpcs --filters "Name=tag:Name,Values=nexus-vpc" --query "Vpcs[0].VpcId" --output text)
$PUBLIC_A = (aws ec2 describe-subnets --filters "Name=tag:Name,Values=nexus-public-a" --query "Subnets[0].SubnetId" --output text)
$PUBLIC_B = (aws ec2 describe-subnets --filters "Name=tag:Name,Values=nexus-public-b" --query "Subnets[0].SubnetId" --output text)
$ECS_SG = (aws ec2 describe-security-groups --filters "Name=group-name,Values=nexus-ecs-sg" --query "SecurityGroups[0].GroupId" --output text)
$TG_ARN = (aws elbv2 describe-target-groups --names nexus-tg --query "TargetGroups[0].TargetGroupArn" --output text)

aws ecs create-service --cluster nexus-cluster --service-name nexus-backend-service --task-definition nexus-backend-task --desired-count 1 --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[$PUBLIC_A,$PUBLIC_B],securityGroups=[$ECS_SG],assignPublicIp=ENABLED}" --load-balancers "targetGroupArn=$TG_ARN,containerName=backend-container,containerPort=3000" --region ap-south-1
```

*   **Purpose:** AWS Fargate par apne NestJS backend ko Sidecar Redis container ke saath production mein Live chalana aur use Load Balancer se connect karna.
*   **Why we use it:** 
    *   **Dynamic ID Fetching:** Terminal session reset hone par agar variables clear ho jayein, toh `describe-*` commands AWS se exact Subnet, Security Group aur Target Group ARNs nikaal kar laati hain taaki hardcoding na karni pade.
    *   **Sidecar Pattern (Zero Extra Cost):** AWS ElastiCache (Redis) ka $15-20/month ka bill bachane ke liye humne ek hi ECS Task ke andar Redis aur NestJS dono containers ko chala diya (`127.0.0.1:6379`).
    *   **Fargate Serverless:** Bina kisi physical EC2 server ko manage/patch kiye, AWS 24/7 containers ko healthy rakhta hai.

### 🔍 Detailed Explanation of Each Command & Flag:

#### 1. `aws ecs create-cluster`
*   `--cluster-name nexus-cluster`: Logical group ka naam jahan aapke saare backend containers chalenge.
*   `--region ap-south-1`: Mumbai AWS Data Center specify karta hai.

#### 2. `aws logs create-log-group`
*   `--log-group-name /ecs/nexus-backend`: CloudWatch mein ek folder banata hai jahan aapke backend application ke `console.log` aur errors live dikhenge.

#### 3. `aws ecs register-task-definition`
*   `--cli-input-json file://task-definition.json`: Task Definition ki saari settings (CPU, RAM, Redis + Backend containers, Environment variables) ko AWS mein register karta hai.

#### 4. Dynamic ID Fetching Commands (`describe-subnets`, `describe-security-groups`, `describe-target-groups`)
*   `--filters "Name=tag:Name,Values=..."`: AWS resources ko unke Tags ya Naam se dhoondta hai.
*   `--query "..."`: AWS ke bade JSON response mein se sirf exact ID (jaise `subnet-xxx` ya `sg-xxx`) ko filter karta hai.
*   `--output text`: Response ko plain text string mein convert karta hai taaki PowerShell variables mein store ho sake.

#### 5. `aws ecs create-service`
*   `--cluster nexus-cluster`: Batata hai ki service kis cluster ke andar chalegi.
*   `--service-name nexus-backend-service`: Production service ka unique naam.
*   `--task-definition nexus-backend-task`: Batata hai ki kis Task Blueprint (Redis + NestJS) ko run karna hai.
*   `--desired-count 1`: Target container count. (1 container online rahega, agar crash hua toh ECS turant naya container start kar dega).
*   `--launch-type FARGATE`: Serverless mode specify karta hai (no EC2 management).
*   `--network-configuration`: 
    *   `subnets=[$PUBLIC_A,$PUBLIC_B]`: Containers ko dono public subnets mein attach karta hai taaki high availability rahe.
    *   `securityGroups=[$ECS_SG]`: Server Bouncer (Firewall) attach karta hai jo sirf Load Balancer se Traffic allow karta hai.
    *   `assignPublicIp=ENABLED`: Container ko public internet IP deta hai taaki wo ECR se image pull kar sake.
*   `--load-balancers`:
    *   `targetGroupArn=$TG_ARN`: Service ko Load Balancer ke Target Group se connect karta hai.
    *   `containerName=backend-container`: Specific container ka naam jahan traffic bhejna hai.
    *   `containerPort=3000`: Backend ka listening port.

---

## Step 10: Live Service Verification & Monitoring

```powershell
# 1. Fetch Application Load Balancer (ALB) Public DNS URL
$ALB_DNS = (aws elbv2 describe-load-balancers --names nexus-alb --query "LoadBalancers[0].DNSName" --output text)
Write-Host "Your Backend Live URL is: http://$ALB_DNS"

# 2. Test Backend API Endpoint
Invoke-RestMethod -Uri "http://$ALB_DNS/health" -Method Get 2>$null

# 3. View Live Container Logs in Real-Time
aws logs tail /ecs/nexus-backend --follow --region ap-south-1
```

*   **Purpose:** Production environment par apne deployed backend application ki health aur live logs verify karna.
*   **Why we use it:** 
    *   **Public DNS URL:** Load Balancer ka URL aapki API ka main entry point ban jata hai. Aap apne frontend `.env` mein `NEXT_PUBLIC_SOCKET_URL` ko is URL se replace kar sakte hain.
    *   **CloudWatch Live Logs:** Live server par chal rahi NestJS aur Redis activity ko monitor karne ke liye.

### 🔍 Detailed Explanation of Commands & Flags:
*   `describe-load-balancers`: Load Balancer ki saari networking details aur Public DNS name nikaalta hai.
*   `aws logs tail`: CloudWatch log stream mein se recent logs fetch karta hai.
*   `--follow`: Real-time streaming on rakhta hai taaki naye requests ke logs turant terminal mein dikhein.

---

## Step 11: Configure Auto Scaling (Production Scaling)

```powershell
# 1. Register Scalable Target (ECS Service ko 1 se 5 containers tak scale karne ki permission)
aws application-autoscaling register-scalable-target --service-namespace ecs --scalable-dimension ecs:service:DesiredCount --resource-id service/nexus-cluster/nexus-backend-service --min-capacity 1 --max-capacity 5 --region ap-south-1

# 2. Create Scaling Policy (Jab CPU > 70% ho toh automatically containers badha do)
@'
{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
        "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleOutCooldown": 60,
    "ScaleInCooldown": 300
}
'@ | Out-File -FilePath scaling-policy.json -Encoding ascii
aws application-autoscaling put-scaling-policy --service-namespace ecs --scalable-dimension ecs:service:DesiredCount --resource-id service/nexus-cluster/nexus-backend-service --policy-name cpu70-target-tracking --policy-type TargetTrackingScaling --target-tracking-scaling-policy-configuration file://scaling-policy.json --region ap-south-1
Remove-Item scaling-policy.json
```

*   **Purpose:** Jab load badhe toh automatically ECS cluster apne aap 5 containers tak scale up ho jaye, aur load kam hone par wapas 1 container par scale down ho jaye (Cost savings + Reliability).

---

## Step 12: Production HTTPS / SSL Configuration (Requires Domain)

> [!WARNING]
> HTTPS set karne ke liye aapke paas ek custom domain (e.g. `yourdomain.com`) hona zaruri hai. AWS ke default `.amazonaws.com` domains par SSL certificate add nahi ho sakta.

```powershell
# 1. Request Free SSL Certificate from AWS Certificate Manager (ACM)
$CERT_ARN = aws acm request-certificate --domain-name "*.yourdomain.com" --validation-method DNS --region ap-south-1 --query 'CertificateArn' --output text

# 2. (Go to AWS Route53/GoDaddy to add the CNAME verification record given by ACM)

# 3. Create HTTPS Listener (Port 443 par encrypted traffic sunna)
aws elbv2 create-listener --load-balancer-arn $ALB_ARN --protocol HTTPS --port 443 --certificates CertificateArn=$CERT_ARN --default-actions Type=forward,TargetGroupArn=$TG_ARN

# 4. Modify Port 80 Listener to redirect HTTP to HTTPS
$LISTENER_80 = aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN --query 'Listeners[?Port==`80`].ListenerArn' --output text
aws elbv2 modify-listener --listener-arn $LISTENER_80 --default-actions Type=redirect,RedirectConfig="{Protocol=HTTPS,Port=443,Host='#{host}',Path='/#{path}',Query='#{query}',StatusCode=HTTP_301}"
```

*   **Purpose:** Sari API requests ko plain text (HTTP) se Encrypted (HTTPS) mein convert karna taaki data secure rahe.
