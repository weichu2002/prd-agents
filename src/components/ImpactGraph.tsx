import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ImpactData } from '../types';

const ImpactGraph: React.FC = () => {
    const svgRef = useRef<SVGSVGElement>(null);

    // Mock data based on the scenario
    const data: ImpactData = {
        nodes: [
            { id: "PRD: 虚拟形象", group: 1, val: 20 },
            { id: "用户中心", group: 2, val: 10 },
            { id: "3D渲染引擎", group: 2, val: 15 },
            { id: "实时通信服务", group: 2, val: 10 },
            { id: "内容审核", group: 3, val: 8 },
            { id: "支付系统", group: 3, val: 5 }
        ],
        links: [
            { source: "PRD: 虚拟形象", target: "用户中心" },
            { source: "PRD: 虚拟形象", target: "3D渲染引擎" },
            { source: "3D渲染引擎", target: "实时通信服务" },
            { source: "实时通信服务", target: "内容审核" }
        ]
    };

    useEffect(() => {
        if (!svgRef.current) return;

        const width = svgRef.current.clientWidth;
        const height = 300;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove(); // Clear previous

        const simulation = d3.forceSimulation(data.nodes as d3.SimulationNodeDatum[])
            .force("link", d3.forceLink(data.links).id((d: any) => d.id).distance(80))
            .force("charge", d3.forceManyBody().strength(-200))
            .force("center", d3.forceCenter(width / 2, height / 2));

        const link = svg.append("g")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .selectAll("line")
            .data(data.links)
            .join("line")
            .attr("stroke-width", 2);

        const node = svg.append("g")
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5)
            .selectAll("circle")
            .data(data.nodes)
            .join("circle")
            .attr("r", (d) => (d.val || 5))
            .attr("fill", (d) => d.group === 1 ? "#FF6A00" : (d.group === 2 ? "#3b82f6" : "#10b981"))
            .call(drag(simulation) as any);

        node.append("title").text((d) => d.id);

        const labels = svg.append("g")
            .selectAll("text")
            .data(data.nodes)
            .join("text")
            .attr("dx", 12)
            .attr("dy", ".35em")
            .text((d) => d.id)
            .style("font-size", "10px")
            .style("fill", "#555");

        simulation.on("tick", () => {
            link
                .attr("x1", (d: any) => d.source.x)
                .attr("y1", (d: any) => d.source.y)
                .attr("x2", (d: any) => d.target.x)
                .attr("y2", (d: any) => d.target.y);

            node
                .attr("cx", (d: any) => d.x)
                .attr("cy", (d: any) => d.y);

            labels
                .attr("x", (d: any) => d.x)
                .attr("y", (d: any) => d.y);
        });

        function drag(simulation: any) {
            function dragstarted(event: any) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                event.subject.fx = event.subject.x;
                event.subject.fy = event.subject.y;
            }

            function dragged(event: any) {
                event.subject.fx = event.x;
                event.subject.fy = event.y;
            }

            function dragended(event: any) {
                if (!event.active) simulation.alphaTarget(0);
                event.subject.fx = null;
                event.subject.fy = null;
            }

            return d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended);
        }
    }, []);

    return <svg ref={svgRef} className="w-full h-[300px] bg-gray-50 rounded-lg border border-gray-100" />;
};

export default ImpactGraph;