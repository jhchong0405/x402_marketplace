// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title X402ServiceRegistry
 * @notice On-chain service catalog for x402 marketplace
 */
contract X402ServiceRegistry is Ownable {
    struct Service {
        bytes32 id;
        address provider;
        uint256 price;
        string name;
        string endpoint;
        bool isActive;
        uint256 createdAt;
    }
    
    mapping(bytes32 => Service) public services;
    mapping(address => bytes32[]) public providerServices;
    bytes32[] public allServiceIds;
    
    event ServiceRegistered(
        bytes32 indexed id,
        address indexed provider,
        uint256 price,
        string name
    );
    event ServiceUpdated(bytes32 indexed id, uint256 newPrice);
    event ServiceDeactivated(bytes32 indexed id);
    event ServiceReactivated(bytes32 indexed id);
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Register a new service
     */
    function registerService(
        bytes32 id,
        address provider,
        uint256 price,
        string calldata name,
        string calldata endpoint
    ) external onlyOwner {
        require(services[id].provider == address(0), "Service exists");
        require(provider != address(0), "Invalid provider");
        require(price > 0, "Price must be > 0");
        
        services[id] = Service({
            id: id,
            provider: provider,
            price: price,
            name: name,
            endpoint: endpoint,
            isActive: true,
            createdAt: block.timestamp
        });
        
        providerServices[provider].push(id);
        allServiceIds.push(id);
        
        emit ServiceRegistered(id, provider, price, name);
    }
    
    /**
     * @notice Update service price
     */
    function updatePrice(bytes32 id, uint256 newPrice) external {
        Service storage service = services[id];
        require(service.provider != address(0), "Service not found");
        require(
            msg.sender == service.provider || msg.sender == owner(),
            "Not authorized"
        );
        require(newPrice > 0, "Price must be > 0");
        
        service.price = newPrice;
        emit ServiceUpdated(id, newPrice);
    }
    
    /**
     * @notice Deactivate service
     */
    function deactivateService(bytes32 id) external {
        Service storage service = services[id];
        require(service.provider != address(0), "Service not found");
        require(
            msg.sender == service.provider || msg.sender == owner(),
            "Not authorized"
        );
        
        service.isActive = false;
        emit ServiceDeactivated(id);
    }
    
    /**
     * @notice Reactivate service
     */
    function reactivateService(bytes32 id) external {
        Service storage service = services[id];
        require(service.provider != address(0), "Service not found");
        require(
            msg.sender == service.provider || msg.sender == owner(),
            "Not authorized"
        );
        
        service.isActive = true;
        emit ServiceReactivated(id);
    }
    
    /**
     * @notice Get service details
     */
    function getService(bytes32 id) external view returns (
        address provider,
        uint256 price,
        bool isActive
    ) {
        Service storage service = services[id];
        require(service.provider != address(0), "Service not found");
        return (service.provider, service.price, service.isActive);
    }
    
    /**
     * @notice Get full service info
     */
    function getServiceInfo(bytes32 id) external view returns (Service memory) {
        require(services[id].provider != address(0), "Service not found");
        return services[id];
    }
    
    /**
     * @notice Get all services for a provider
     */
    function getProviderServices(address provider) 
        external 
        view 
        returns (bytes32[] memory) 
    {
        return providerServices[provider];
    }
    
    /**
     * @notice Get total number of services
     */
    function getServiceCount() external view returns (uint256) {
        return allServiceIds.length;
    }
    
    /**
     * @notice Get all service IDs
     */
    function getAllServiceIds() external view returns (bytes32[] memory) {
        return allServiceIds;
    }
}
